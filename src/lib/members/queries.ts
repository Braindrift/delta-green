/**
 * Member-screen read queries against the deployed Supabase tables.
 *
 * Returns the Result-shape from `@/lib/records/errors` rather than throwing,
 * mirroring `@/lib/campaigns/queries`. Every function in this file is a
 * client-side read; writes live in `./mutations.ts`.
 *
 * Profile enrichment pattern: `campaign_members` and `campaign_invitations`
 * carry only `user_id` / `invitee_user_id`. `user_profiles` is a separate
 * table — there is no PostgREST-recognised FK relationship between them
 * (both reference `auth.users(id)`), so embedding via `select('...,
 * user_profile:user_profiles(...)')` is not available. Instead each query
 * fetches the base rows, then issues a second query against
 * `user_profiles` keyed by `user_id IN (...)` and merges in-memory. This
 * mirrors the `getMemberCountsByCampaign` pattern used by the workspace
 * landing page.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type {
  CampaignMember,
  CampaignMemberRole,
  CampaignMemberWithProfile,
  CampaignInvitation,
  PendingInvitationWithProfile,
  UserProfileSummary,
} from '@/types/members';

/* -------------------------------------------------------------------------- */
/*  Member roster                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fetch every `campaign_members` row visible to the caller for the given
 * campaign, enriched with `user_profiles.username`. Active + former are
 * returned together; the UI splits them into the "Active" and "Former
 * agents" sections.
 *
 * The Handler-only RLS policy on `campaign_members`
 * (`campaign_members: gm can read all`, added in
 * `20260517120000_extend_campaign_members_with_status.sql`) is the one that
 * surfaces former rows here. A non-Handler caller will only see active
 * rows through `is_campaign_member`; the page itself is Handler-gated by
 * `ManageGuard` so the discrepancy doesn't matter in practice.
 *
 * Ordered by `created_at` ascending so the list is stable across reloads.
 */
export async function listCampaignMembers(
  campaignId: string,
): Promise<Result<CampaignMemberWithProfile[]>> {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('id, campaign_id, user_id, role, status, left_at, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  if (error) return mapPostgrestError(error);

  const members = (data ?? []) as CampaignMember[];
  if (members.length === 0) return ok([]);

  const profiles = await listUserProfilesByIds(members.map((m) => m.user_id));
  if (!profiles.ok) return profiles;

  return ok(
    members.map((m) => ({
      ...m,
      username: profiles.data[m.user_id] ?? null,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/*  My membership role                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the authenticated user's role within the given campaign (DEL-60).
 *
 * Returns `ok('gm' | 'player')` for an active membership, `ok(null)` for
 * "not an active member" (no session, no row, RLS-hidden — all collapse to
 * the same "you don't have a role here" outcome for the caller).
 *
 * Why `null` and not a `not_found` Err: the hook `useCurrentCampaignRole`
 * consumes this and exposes a `role: 'gm' | 'player' | null` field. Folding
 * "not a member" into a successful `null` saves the hook a branch and
 * matches the DoD ("returns null for non-members"). True errors
 * (`forbidden` on write paths, unexpected PostgREST failures) still come
 * back as `Err` variants for the hook to surface as `error.kind = 'unknown'`.
 *
 * Filters on `status = 'active'` so a `former` member after a kick/leave
 * resolves to `null` rather than carrying their old `role`. `.maybeSingle()`
 * is chosen over `.single()` because absence is the legitimate "not a
 * member" case, not an exceptional `PGRST116`.
 */
export async function getMyMembershipRole(
  campaignId: string,
): Promise<Result<CampaignMemberRole | null>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return ok(null);

  const { data, error } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return ok(null);

  // `role` is a literal-union text column — narrow defensively rather than
  // casting blindly, so an unexpected DB value surfaces as `unknown`
  // instead of leaking through as a bad role into the UI.
  const role = (data as { role: unknown }).role;
  if (role === 'gm' || role === 'player') return ok(role);
  return unknown(new Error(`getMyMembershipRole: unexpected role value ${String(role)}`));
}

/* -------------------------------------------------------------------------- */
/*  Pending invitations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fetch every still-actionable `campaign_invitations` row for the campaign
 * — i.e. `status = 'pending' AND expires_at > now()`. Expired-but-still-
 * pending rows are intentionally hidden from the screen; they're effectively
 * dead invites that no sweep has rewritten yet.
 *
 * Existing-user invites carry an `invitee_user_id`; the username for
 * that user is merged from `user_profiles`. Email-only (stranger)
 * invites have no profile row to merge; `username` is left null and the
 * UI falls back to `invitee_email`.
 *
 * Ordered newest-first so freshly issued invites surface at the top
 * of the Pending section.
 */
export async function listPendingInvitations(
  campaignId: string,
): Promise<Result<PendingInvitationWithProfile[]>> {
  const { data, error } = await supabase
    .from('campaign_invitations')
    .select('id, campaign_id, invited_by, invitee_user_id, invitee_email, message, status, expires_at, created_at, resolved_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return mapPostgrestError(error);

  const invitations = (data ?? []) as CampaignInvitation[];
  if (invitations.length === 0) return ok([]);

  // Only the existing-user invites need a profile lookup; stranger
  // invites match by email and have no profile row to merge.
  const userIds = invitations
    .map((i) => i.invitee_user_id)
    .filter((id): id is string => id !== null);

  if (userIds.length === 0) {
    return ok(invitations.map((i) => ({ ...i, username: null })));
  }

  const profiles = await listUserProfilesByIds(userIds);
  if (!profiles.ok) return profiles;

  return ok(
    invitations.map((i) => ({
      ...i,
      username: i.invitee_user_id ? profiles.data[i.invitee_user_id] ?? null : null,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/*  User search & lookup                                                      */
/* -------------------------------------------------------------------------- */

/** Default cap for the "Find user" autocomplete. */
const SEARCH_LIMIT_DEFAULT = 10;

/**
 * Username-prefix search against `user_profiles`. Returns up to `limit`
 * matches ordered by username. The `username` column is `citext`
 * (per `20260518090000_add_user_profiles_table.sql`), so `ilike` is
 * case-insensitive by default; the `%` suffix turns it into a
 * prefix match.
 *
 * Empty / whitespace-only queries return an empty array without a
 * round-trip — the autocomplete uses this to clear its result list
 * when the input is blanked.
 */
export async function searchUsersByUsername(
  query: string,
  limit: number = SEARCH_LIMIT_DEFAULT,
): Promise<Result<UserProfileSummary[]>> {
  const trimmed = query.trim();
  if (trimmed === '') return ok([]);

  // Escape PostgREST `ilike` wildcards (`%` and `_`) so a user typing
  // either character searches for a literal match instead of widening
  // the result set. Backslash isn't a wildcard in the LIKE family, so
  // a literal `\` in the input is harmless.
  const escaped = trimmed.replace(/[%_]/g, (ch) => `\\${ch}`);

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username')
    .ilike('username', `${escaped}%`)
    .order('username', { ascending: true })
    .limit(limit);

  if (error) return mapPostgrestError(error);

  // PostgREST returns `username` as a string-like; cast to plain string
  // for the consumer surface. The `citext` round-trip is invisible to
  // the client.
  return ok(
    ((data ?? []) as Array<{ user_id: string; username: string }>).map((p) => ({
      user_id: p.user_id,
      username: p.username,
    })),
  );
}

/**
 * Resolve an email address to an `auth.users.id` via the
 * `find_user_by_email` RPC
 * (`20260518100000_member_kick_pc_demote_and_email_lookup.sql`). Returns
 * `ok(null)` when no user matches that email — this is the boundary
 * between M-4 (existing-user invite) and M-5 (stranger invite). The
 * Members screen uses the null result to render the inline "user with
 * this email not found" error.
 *
 * Trims and lowercases caller-side defensively; the RPC also
 * lowercases internally, so this is belt-and-braces.
 */
export async function findUserByEmail(email: string): Promise<Result<string | null>> {
  const trimmed = email.trim();
  if (trimmed === '') return ok(null);

  const { data, error } = await supabase.rpc('find_user_by_email', {
    p_email: trimmed.toLowerCase(),
  });

  if (error) return mapPostgrestError(error);

  // The RPC returns a scalar uuid (or null). `data` is typed as `unknown`
  // because the generated types aren't wired up — narrow defensively.
  if (data === null || data === undefined) return ok(null);
  if (typeof data === 'string') return ok(data);
  return unknown(new Error('find_user_by_email returned unexpected shape'));
}

/* -------------------------------------------------------------------------- */
/*  Internal: profile fan-out                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fetch usernames for the given user ids in one round-trip. Returns a
 * map keyed by `user_id`; ids without a profile row are simply absent
 * from the map (every authenticated user has a profile via the
 * `on_auth_user_created` trigger, but the caller still has to handle
 * the absence to stay total).
 */
async function listUserProfilesByIds(
  userIds: string[],
): Promise<Result<Record<string, string>>> {
  if (userIds.length === 0) return ok({});

  // De-duplicate so a roster with many members owned by the same user
  // (unusual but possible for service accounts) doesn't bloat the IN
  // clause.
  const uniqueIds = Array.from(new Set(userIds));

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username')
    .in('user_id', uniqueIds);

  if (error) return mapPostgrestError(error);

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ user_id: string; username: string }>) {
    map[row.user_id] = row.username;
  }
  return ok(map);
}
