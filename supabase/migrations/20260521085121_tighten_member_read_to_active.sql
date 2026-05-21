-- DEL-70 — Tighten `campaign_members` member-side read to active rows only.
--
-- Background
-- ----------
-- The DEL-36 split (20260517120000) replaced the original combined
-- SELECT policy with two narrower ones:
--
--   campaign_members: active members can read  →  is_campaign_member(campaign_id)
--   campaign_members: gm can read all          →  is_campaign_gm(campaign_id)
--
-- The member-side policy intentionally did not filter the row's status,
-- because at the time `campaign_members` was only read from the
-- Handler-gated Members screen and the Manage subtree — both of which
-- want the full active+former roster.
--
-- DEL-70 introduces a member-facing surface (`CampaignInfoPanel`) that
-- lists every member in the campaign. With the looser policy, a
-- non-Handler caller would see `status='former'` rows in that list — a
-- minor information leak (former members shouldn't surface in a member
-- view at all). Tighten the member-side policy to `status = 'active'`
-- rows only; the Handler-side policy stays untouched so the Members
-- screen keeps its full visibility.

drop policy "campaign_members: active members can read" on campaign_members;

create policy "campaign_members: members can read active"
  on campaign_members for select
  using (
    status = 'active'
    and is_campaign_member(campaign_id)
  );

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor as the relevant
-- user to confirm the cut-off works)
-- ============================================================
--
--   -- As an active non-Handler member of campaign X, the following
--   -- should return only active rows (no former rows visible):
--   select user_id, role, status from campaign_members
--     where campaign_id = '<X>';
--
--   -- As the Handler of campaign X, the same query should still
--   -- return every row (active + former):
--   select user_id, role, status from campaign_members
--     where campaign_id = '<X>';
