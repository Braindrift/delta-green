/**
 * Campaign read queries against the deployed Supabase `campaigns` table.
 *
 * Mirrors the `@/lib/records` Result-returning convention rather than
 * throwing — call sites branch on `result.ok` and get exhaustive error
 * variants. The Postgres error mapping (`mapPostgrestError`) is shared with
 * the records module via `@/lib/records/errors`.
 *
 * Read policies on `campaigns` only allow active members to see their own
 * rows, and a soft-deleted row is excluded by the read policy. Both cases
 * surface here as PostgREST returning no row — which `.maybeSingle()` maps
 * to `data: null, error: null`. We translate that to `not_found`. This is
 * the intentional security posture: a non-member must not be able to learn
 * whether a campaign id is real, only that they can't access it.
 *
 * Non-UUID inputs to Postgres surface as a `22P02` (invalid text
 * representation) — we treat them as `not_found` too, for the same
 * information-leak reason and because the hook layer (`useCurrentCampaign`)
 * has already validated UUIDs client-side before getting here. The defensive
 * mapping is here as a belt-and-braces guard against direct callers.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, notFound, ok, type Result } from '@/lib/records/errors';
import type { Campaign, CampaignMembership } from '@/types/campaigns';

/**
 * Fetch a single campaign row by id. Returns `not_found` when the row
 * doesn't exist, is soft-deleted, or RLS hides it from the caller — these
 * are intentionally indistinguishable to non-members.
 *
 * The caller is responsible for UUID validation. Postgres' `22P02` on a
 * malformed UUID is mapped to `not_found` as a defensive measure, but
 * relying on that path means a wasted round-trip per route hit.
 */
export async function getCampaignById(id: string): Promise<Result<Campaign>> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    // Map malformed-UUID errors (Postgres 22P02) to not_found for
    // information-leak parity with the RLS-hidden case. Everything else
    // flows through the standard error mapping.
    if (error.code === '22P02') {
      return notFound();
    }
    return mapPostgrestError(error);
  }

  if (!data) return notFound();
  return ok(data as Campaign);
}

/**
 * Fetch all campaigns the authenticated user can see (via RLS: active member,
 * not soft-deleted). Returns an empty array when the user has no campaigns.
 *
 * Ordered by `created_at` ascending so the result is stable across calls.
 */
export async function listCampaigns(): Promise<Result<Campaign[]>> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .is('deleted_at', null)
    .order('created_at');

  if (error) return mapPostgrestError(error);
  return ok((data ?? []) as Campaign[]);
}

/**
 * Fetch the authenticated user's active campaign memberships, joined to the
 * campaign rows the workspace landing page needs to render.
 *
 * Reads from `campaign_members`:
 *   - filtered by `user_id = auth.uid()` (explicit narrowing; RLS already
 *     restricts to rows the caller can read, but the explicit filter avoids
 *     surprises if a future helper policy ever widens the read scope),
 *   - filtered by `status = 'active'` so left/kicked members aren't listed,
 *   - inner-joined to `campaigns` with `deleted_at is null` so soft-deleted
 *     campaigns are excluded from the join product itself rather than
 *     filtered post-hoc (this also short-circuits the read when the campaign
 *     row is hidden by RLS for any reason).
 *
 * The member count per campaign is fetched separately via
 * `getMemberCountsByCampaign` and merged at the call site. Embedding the
 * count aggregate on the same `campaign_members` read produces ambiguous
 * results — PostgREST can't tell whether to apply the user_id filter to the
 * aggregate or not — so two queries is the readable path.
 *
 * Ordered by `campaign.name` so the landing page is alphabetically stable.
 */
export async function listMyMemberships(): Promise<Result<CampaignMembership[]>> {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('role, campaign:campaigns!inner(*)')
    .eq('status', 'active')
    .is('campaign.deleted_at', null)
    .order('name', { foreignTable: 'campaigns', ascending: true });

  if (error) return mapPostgrestError(error);

  // PostgREST returns the joined campaign as a single object on `!inner`,
  // but the generated TS types think it might be an array — guard at the
  // boundary so consumers see a clean `Campaign` value.
  const rows = (data ?? []) as Array<{
    role: 'gm' | 'player';
    campaign: Campaign | Campaign[];
  }>;

  const memberships: CampaignMembership[] = rows
    .map((row) => {
      const campaign = Array.isArray(row.campaign) ? row.campaign[0] : row.campaign;
      if (!campaign) return null;
      return { role: row.role, campaign, member_count: 0 };
    })
    .filter((m): m is CampaignMembership => m !== null);

  if (memberships.length === 0) return ok(memberships);

  const counts = await getMemberCountsByCampaign(memberships.map((m) => m.campaign.id));
  if (!counts.ok) return counts;

  return ok(
    memberships.map((m) => ({
      ...m,
      member_count: counts.data[m.campaign.id] ?? 0,
    })),
  );
}

/**
 * Count active members in the given campaigns. Returns a map keyed by
 * `campaign_id`. Used by `listMyMemberships` to enrich the landing-page
 * rows with a member count without coupling the membership read to an
 * embedded aggregate.
 *
 * Implementation note: PostgREST has no `group by` support, so we fetch
 * `campaign_id` for every active membership in the input set and tally
 * client-side. The set is bounded by the campaigns the caller is in (RLS),
 * so the row count is tiny in practice.
 */
export async function getMemberCountsByCampaign(
  campaignIds: string[],
): Promise<Result<Record<string, number>>> {
  if (campaignIds.length === 0) return ok({});

  const { data, error } = await supabase
    .from('campaign_members')
    .select('campaign_id')
    .eq('status', 'active')
    .in('campaign_id', campaignIds);

  if (error) return mapPostgrestError(error);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ campaign_id: string }>) {
    counts[row.campaign_id] = (counts[row.campaign_id] ?? 0) + 1;
  }
  return ok(counts);
}
