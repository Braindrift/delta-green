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
 * NOTE: This file is the single source of truth for the Campaign row type.
 * If new columns are added to `campaigns`, update this type — `CampaignContext`
 * and the queries layer will pick the change up automatically through the
 * `Campaign` import.
 */

export type Campaign = {
  id: string;
  owner_id: string;
  name: string;
  codename: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

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
