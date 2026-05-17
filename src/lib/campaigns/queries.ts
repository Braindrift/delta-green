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
import type { Campaign } from '@/types/campaigns';

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
