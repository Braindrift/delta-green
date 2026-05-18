-- ============================================================
-- DEL-42: add max_agents to campaigns
-- ============================================================
-- Persists the per-campaign cap chosen during creation. Stored
-- as a real column rather than in a settings JSONB so it's
-- queryable and constraint-checked at the DB layer.
--
-- Default 6 matches the form default. Existing rows (pre-3.5,
-- created before this column existed) backfill to 6 via the
-- default.
-- ============================================================

alter table campaigns
  add column max_agents int not null default 6
    check (max_agents between 1 and 12);
