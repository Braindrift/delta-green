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
 *   - Read-back uses `.select(...).single()` on the inserted row, which is
 *     visible to the caller through the `campaigns: members can read` policy
 *     because the trigger has already made them a member.
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
