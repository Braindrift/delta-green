-- DEL-88: DB index maintenance — add 3 missing FK covers, drop 2 redundant indexes.
-- Pure index maintenance: affects query plans only, never query results.

-- S5: cover the missing foreign keys flagged by the performance advisor
-- (unindexed_foreign_keys). The composite campaign_members(campaign_id, user_id)
-- index does NOT serve WHERE user_id = ?, so the workspace landing page seq-scans.
create index campaign_members_user_id_idx
  on campaign_members(user_id);
create index campaigns_owner_id_idx
  on campaigns(owner_id);
create index campaign_invitations_invited_by_idx
  on campaign_invitations(invited_by);

-- S6: drop redundant campaign_members_campaign_user_idx — fully covered by the
-- unique-constraint backing index campaign_members_campaign_id_user_id_key,
-- which serves the same (campaign_id, user_id) reads.
drop index if exists campaign_members_campaign_user_idx;

-- N2: drop redundant records_campaign_id_idx — fully covered by
-- records_campaign_type_idx, whose leading column is campaign_id.
drop index if exists records_campaign_id_idx;
