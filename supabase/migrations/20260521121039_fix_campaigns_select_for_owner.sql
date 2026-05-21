-- DEL-72 — Fix `create campaign` regression by adding an owner branch to the
-- `campaigns: members can read` SELECT policy.
--
-- Symptom
-- -------
-- `createCampaign` (src/lib/campaigns/mutations.ts) issues an `insert ...
-- select * ... single()` against the `campaigns` table. PostgREST translates
-- that to a single `insert ... returning *` statement. The insert itself
-- passes the `campaigns: authenticated can create` WITH CHECK, the
-- `campaign_owner_becomes_gm` AFTER INSERT trigger fires and inserts the
-- Handler row into `campaign_members` — and then PostgreSQL aborts the
-- statement with
--
--   42501 — new row violates row-level security policy for table "campaigns"
--
-- The misleading message is actually a SELECT-visibility failure: when an
-- INSERT uses RETURNING, PostgreSQL evaluates the table's SELECT policy
-- against the new row to validate the projection. Today's SELECT policy
-- requires `is_campaign_member(id)`, which looks up a row in
-- `campaign_members`. The Handler `campaign_members` row that the trigger
-- inserts is not visible to that helper within the same INSERT statement
-- — the statement-level MVCC snapshot was taken before the AFTER ROW
-- trigger fired, and the SECURITY DEFINER helper inherits it. The helper
-- returns false, the policy rejects the read-back, and the whole INSERT
-- aborts.
--
-- An identical insert without RETURNING succeeds: the trigger inserts the
-- membership row, and `is_campaign_member` returns true on every
-- subsequent statement. The bug is specific to the same-statement
-- RETURNING path.
--
-- Fix
-- ---
-- Add an owner-direct branch to the SELECT policy. The
-- `campaign_owner_becomes_gm` trigger already guarantees that the owner is
-- an active member, so allowing `auth.uid() = owner_id` does not widen
-- *who* can read a campaign — it just gives the policy a path that does
-- not depend on the trigger's membership row being visible to the SELECT
-- evaluation of the same statement.
--
-- Notes
-- -----
-- * `deleted_at is null` is preserved, so soft-deleted campaigns stay
--   hidden from everyone including the owner.
-- * After a Handler-ownership transfer (DEL-49) `campaigns.owner_id`
--   points at the new Handler. The previous owner reads via
--   `is_campaign_member` like any other player, so no semantic shift.
-- * No changes to write policies, helpers, or the trigger — the fix is
--   scoped to the read path that surfaces the snapshot quirk.

drop policy "campaigns: members can read" on campaigns;

create policy "campaigns: members can read"
  on campaigns for select
  using (
    deleted_at is null
    and (auth.uid() = owner_id or is_campaign_member(id))
  );

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor as the
-- relevant user to confirm the fix)
-- ============================================================
--
--   -- As an authenticated user creating a fresh campaign, the
--   -- `returning *` clause should now succeed:
--   insert into campaigns (owner_id, name, description, max_agents)
--   values (auth.uid(), 'DEL-72 smoke', null, 6)
--   returning id, name;
--
--   -- The trigger should still create the Handler `campaign_members`
--   -- row in the same transaction:
--   select role, status from campaign_members
--     where campaign_id = '<id from above>'
--       and user_id = auth.uid();
