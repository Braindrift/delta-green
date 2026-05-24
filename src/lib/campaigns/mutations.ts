/**
 * Campaign write operations against the deployed Supabase `campaigns` table.
 *
 * Mirrors `@/lib/campaigns/queries`: Result-returning, shared PostgREST error
 * mapping via `@/lib/records/errors`. Throws are caller-poison and are not
 * used here.
 *
 * RLS context:
 *   - Insert is guarded by `campaigns: authenticated can create`, which
 *     requires `auth.uid() = owner_id`. The trigger
 *     `campaign_owner_becomes_gm` then inserts the Handler `campaign_members`
 *     row in the same transaction, so the caller does not need a follow-up
 *     write.
 *   - Read-back uses `.select(...).single()` on the inserted row. PostgREST
 *     evaluates the `campaigns: members can read` SELECT policy against the
 *     returned row to validate the RETURNING projection. That policy has
 *     two paths (`auth.uid() = owner_id or is_campaign_member(id)`) — the
 *     owner branch is what carries this call, because the trigger's
 *     `campaign_members` row is not visible to `is_campaign_member` within
 *     the same INSERT statement (the AFTER ROW trigger fires inside the
 *     outer statement's MVCC snapshot). DEL-72 added the owner branch
 *     specifically to make this read-back work; without it the insert
 *     aborts with `42501 — new row violates RLS policy for table
 *     "campaigns"` even though the underlying insert and trigger both
 *     succeeded.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type { Campaign } from '@/types/campaigns';

/**
 * Insert payload for `createCampaign`. Server-set columns (`id`, timestamps,
 * `deleted_at`, `owner_id`) are not part of the input — `owner_id` is taken
 * from the active Supabase session inside the function so callers cannot
 * accidentally forge it.
 */
export type CreateCampaignInput = {
  name: string;
  description: string | null;
  max_agents: number;
};

/**
 * Create a campaign owned by the authenticated user. The Handler
 * `campaign_members` row is created automatically by the
 * `campaign_owner_becomes_gm` trigger.
 *
 * Returns the inserted `Campaign` row on success. Error variants:
 *   - `forbidden` — RLS denied the insert (e.g., the session has no user)
 *   - `conflict`  — a DB-level unique violation (`23505`). The schema has no
 *     unique constraint on campaign name today, so this is a defensive
 *     mapping; the name-uniqueness check is done client-side via
 *     `checkCampaignNameAvailable` before submit.
 *   - `unknown`   — any other PostgREST error, plus the "session not yet
 *     hydrated" fall-through.
 */
export async function createCampaign(input: CreateCampaignInput): Promise<Result<Campaign>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const row = {
    owner_id: userId,
    name: input.name,
    description: input.description,
    max_agents: input.max_agents,
  };

  const { data, error } = await supabase.from('campaigns').insert(row).select('*').single();

  if (error) return mapPostgrestError(error);
  return ok(data as Campaign);
}

/**
 * Soft-delete a campaign (DEL-48). Routes through the `soft_delete_campaign`
 * RPC rather than a direct `update campaigns set deleted_at = now()`.
 *
 * Why an RPC: PostgreSQL enforces SELECT-policy visibility on the post-image
 * of every UPDATE, and `campaigns: members can read` requires
 * `deleted_at is null`. A direct update by the Handler therefore aborts with
 * `42501 — new row violates RLS policy on "campaigns"` even though the
 * `gm can update` policy itself passes. The `security definer` RPC bypasses
 * RLS for the write and returns a discriminator string. This mirrors the
 * shape `leave_campaign` (DEL-47) takes for the same class of reason.
 *
 * Side effects (all in-transaction with the RPC's update):
 *   - The DEL-35 `campaigns_notify_soft_delete` trigger fans out
 *     `campaign_deleted` notifications to every active member except the
 *     caller.
 *   - RLS read policies that already filter `deleted_at is null` (the
 *     `campaigns` SELECT policy, `listMyMemberships`' join condition,
 *     `getCampaignById`) drop the campaign from every member's view.
 *
 * Returns `ok(true)` on success. The RPC's `not_member` / `not_handler` /
 * `not_authenticated` discriminators are mapped to `unknown` here: the
 * Settings page is gated by `ManageGuard` and the landing-card kebab only
 * renders on Handler-owned cards, so these branches are not reachable from
 * the UI in v1. A surface that needs to distinguish them can lift the
 * discriminator into a typed union at that point, mirroring
 * `LeaveCampaignOutcome` in `@/lib/members`.
 */
export async function softDeleteCampaign(campaignId: string): Promise<Result<true>> {
  const { data, error } = await supabase.rpc('soft_delete_campaign', {
    p_campaign_id: campaignId,
  });

  if (error) return mapPostgrestError(error);
  if (data === 'deleted') return ok(true);

  return unknown(
    new Error(`Unexpected soft_delete_campaign outcome: ${String(data)}`),
  );
}

/**
 * Patch a campaign's editable fields (DEL-71). The Handler-only inline form
 * in `CampaignInfoPanel` writes through here.
 *
 * RLS context: the `campaigns: owner can update` policy gates this on
 * `auth.uid() = owner_id`. The post-image read-back is allowed by the same
 * `campaigns: members can read` policy that covers `createCampaign` — the
 * owner branch added in DEL-72 makes `.select(...).single()` resolve for the
 * Handler. Players hitting this path get `forbidden`.
 *
 * The shape mirrors `createCampaign`: server-set columns are excluded; the
 * caller passes only the three Handler-editable fields. A partial patch is
 * fine — Supabase only writes the keys present in the object.
 */
export type UpdateCampaignPatch = Partial<
  Pick<Campaign, 'name' | 'description' | 'max_agents'>
>;

export async function updateCampaign(
  campaignId: string,
  patch: UpdateCampaignPatch,
): Promise<Result<Campaign>> {
  const { data, error } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('id', campaignId)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as Campaign);
}

/**
 * Returns `ok(true)` if the authenticated user has no non-deleted campaign
 * with the given (trimmed) name, `ok(false)` if such a campaign exists.
 *
 * Scoped to the caller's owned campaigns per the DEL-42 spec — global
 * uniqueness is too aggressive. The query relies on the `campaigns: members
 * can read` RLS policy: the caller is always a member of campaigns they own
 * (the trigger ensures it), so RLS does not hide their own rows.
 */
export async function checkCampaignNameAvailable(name: string): Promise<Result<boolean>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const { data, error } = await supabase
    .from('campaigns')
    .select('id')
    .eq('owner_id', userId)
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1);

  if (error) return mapPostgrestError(error);
  return ok((data ?? []).length === 0);
}
