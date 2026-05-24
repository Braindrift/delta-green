/**
 * Campaign row shape.
 *
 * Mirrors the deployed Supabase `campaigns` table
 * (`supabase/migrations/20260505213138_initial_schema.sql`). Snake_case is kept
 * because every read goes through PostgREST, which returns the underlying
 * column names — `useCurrentCampaign` consumers see the same fields a
 * `.select('*')` produces.
 *
 * `deleted_at` is non-null only after a soft-delete. The campaigns RLS read
 * policy excludes soft-deleted rows from member reads, so in practice the
 * field is only ever `null` on the client — it's exposed here for parity with
 * the table and for the eventual Workspace-layer recovery flow (if any).
 *
 * NOTE: The row shape is the generated `campaigns` table type (DEL-92), so new
 * columns flow in automatically the next time `src/types/database.ts` is
 * regenerated — `CampaignContext` and the queries layer pick the change up
 * through the `Campaign` import. The `campaigns` table has no enum/JSONB
 * columns, so no overrides are needed here.
 */

import type { Tables } from '@/types/database';

export type Campaign = Tables<'campaigns'>;

/**
 * Membership-scoped view of a campaign, used by the workspace landing page.
 *
 * Carries the caller's role in the campaign alongside the campaign row
 * itself, so the landing page can group rows by Handler / Agent without
 * making a second query. `member_count` is the count of active members
 * in the campaign — merged in from `getMemberCountsByCampaign` rather than
 * embedded in the membership read, because PostgREST embedded aggregates
 * over the same table that supplies the filter produces ambiguous results.
 */
export type CampaignMembership = {
  role: 'gm' | 'player';
  campaign: Campaign;
  member_count: number;
};
