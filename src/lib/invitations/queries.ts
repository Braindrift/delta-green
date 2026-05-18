/**
 * Magic-link invite token queries.
 *
 * Read-only access to a `campaign_invitations` row via its single-use token.
 * Goes through the `get_invitation_by_token` security-definer RPC (DEL-34)
 * so the call works for unauthenticated visitors — the table itself is
 * inaccessible to `anon`, and the RPC returns only the minimum fields the
 * landing page needs.
 *
 * The RPC returns zero rows for unknown tokens, non-stranger tokens (no
 * `invitee_email`), or tokens whose row has been deleted. We map zero
 * rows to `ok(null)` so the caller has a single "this token doesn't
 * resolve" branch to handle.
 *
 * Status-vs-expiry is intentionally NOT filtered server-side: the caller
 * needs the real status + `expires_at` to pick the correct
 * `InviteGoneScreen` variant (revoked / expired / accepted / declined).
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, notFound, ok, unknown, type Result } from '@/lib/records/errors';
import type {
  CampaignInvitationStatus,
  InvitationAcceptView,
  InvitationByToken,
} from '@/types/members';

type RawInvitationByToken = {
  campaign_name: string;
  inviter_handle: string;
  status: string;
  expires_at: string;
  message: string | null;
  invitee_email: string;
};

/**
 * Resolve an invite token to its display payload. Returns `ok(null)` when
 * the token doesn't match a known stranger invite.
 */
export async function getInvitationByToken(
  token: string,
): Promise<Result<InvitationByToken | null>> {
  const trimmed = token.trim();
  if (trimmed === '') return ok(null);

  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    p_token: trimmed,
  });

  if (error) return mapPostgrestError(error);

  // PostgREST returns the rowset as an array. The RPC's WHERE clause can
  // match zero or one row; treat empty as "token not found".
  const rows = (data ?? []) as RawInvitationByToken[];
  if (rows.length === 0) return ok(null);

  const row = rows[0];
  if (!isKnownStatus(row.status)) {
    return unknown(new Error(`Unknown invitation status: ${row.status}`));
  }

  return ok({
    campaign_name: row.campaign_name,
    inviter_handle: row.inviter_handle,
    status: row.status,
    expires_at: row.expires_at,
    message: row.message,
    invitee_email: row.invitee_email,
  });
}

const KNOWN_STATUSES: ReadonlyArray<CampaignInvitationStatus> = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
];

function isKnownStatus(value: string): value is CampaignInvitationStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/*  In-app accept-screen view                                                 */
/* -------------------------------------------------------------------------- */

type RawInvitationAcceptRow = {
  id: string;
  campaign_id: string;
  invitee_user_id: string | null;
  status: string;
  expires_at: string;
  message: string | null;
  invited_by: string;
  campaign:
    | { id: string; name: string; max_agents: number; deleted_at: string | null }
    | Array<{ id: string; name: string; max_agents: number; deleted_at: string | null }>
    | null;
};

/**
 * Fetch the invitation + its campaign for the in-app accept screen
 * (DEL-46). Returns `not_found` when the row doesn't exist or RLS hides
 * it — the page treats that as "invitation gone" and renders the
 * matching `InviteGoneScreen`.
 *
 * Two reads (mirror the `listPendingInvitations` profile-merge pattern):
 *   1. The invitation joined to its campaign via the `!inner` FK embed.
 *      Soft-deleted campaigns get their `deleted_at` populated; the page
 *      uses that to render the `'deleted'` variant before submitting.
 *   2. The inviter's username from `user_profiles`, keyed by
 *      `campaign_invitations.invited_by`. Public-readable per the
 *      profile RLS.
 *   3. The active-member count for the campaign, so the page can render
 *      `Seats N / M` and pre-empt the `'full'` variant before submit.
 *
 * `active_member_count` and `campaign_deleted_at` are advisory — the RPC
 * does the authoritative checks atomically. Caller still renders the
 * counter from this data so the user sees a number before submitting.
 */
export async function getInvitationForAccept(
  invitationId: string,
): Promise<Result<InvitationAcceptView>> {
  const { data, error } = await supabase
    .from('campaign_invitations')
    .select(
      'id, campaign_id, invitee_user_id, status, expires_at, message, invited_by, campaign:campaigns!inner(id, name, max_agents, deleted_at)',
    )
    .eq('id', invitationId)
    .maybeSingle();

  if (error) {
    if (error.code === '22P02') return notFound();
    return mapPostgrestError(error);
  }
  if (!data) return notFound();

  const row = data as unknown as RawInvitationAcceptRow;
  const campaign = Array.isArray(row.campaign) ? row.campaign[0] ?? null : row.campaign;
  if (!campaign) return notFound();

  if (!isKnownStatus(row.status)) {
    return unknown(new Error(`Unknown invitation status: ${row.status}`));
  }

  // Inviter username + active member count fan-out. Both are independent
  // of the invitation read and either can fail without invalidating the
  // others; surface the first failure and let the caller retry the whole
  // load.
  const [profileResult, countResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', row.invited_by)
      .maybeSingle(),
    supabase
      .from('campaign_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'active'),
  ]);

  if (profileResult.error) return mapPostgrestError(profileResult.error);
  if (countResult.error) return mapPostgrestError(countResult.error);

  const inviterUsername =
    (profileResult.data as { username: string } | null)?.username ?? null;

  return ok({
    invitation_id: row.id,
    campaign_id: row.campaign_id,
    campaign_name: campaign.name,
    campaign_max_agents: campaign.max_agents,
    campaign_deleted_at: campaign.deleted_at,
    inviter_username: inviterUsername,
    status: row.status,
    expires_at: row.expires_at,
    message: row.message,
    invitee_user_id: row.invitee_user_id,
    active_member_count: countResult.count ?? 0,
  });
}
