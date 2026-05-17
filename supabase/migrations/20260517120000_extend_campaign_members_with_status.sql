-- DEL-36 — Extend `campaign_members` with `status` + `left_at` (soft-leave
-- support).
--
-- Adds the schema columns needed to model soft-leave (player leaves a
-- campaign on their own) and Handler-kick (Handler removes a player from
-- a campaign) without losing the historical membership row. The leave/kick
-- UI lands later (DEL-44 / DEL-47); this migration is the load-bearing
-- schema + RLS change those flows depend on.
--
-- The load-bearing piece is the helper update: `is_campaign_member` and
-- `is_campaign_gm` now require `status = 'active'`. Because every read
-- policy on `records`, `record_visibility`, `linked_records`, `sessions`,
-- and `campaigns` itself routes through one of these helpers, a row
-- transitioning to `status = 'former'` loses access to that campaign's
-- data transitively, in one place, with no per-table policy edits.
--
-- The one exception is `campaign_members` itself. The original policy
-- ("campaign_members: members can read") was also keyed off
-- `is_campaign_member`. After the helper change that policy would
-- correctly stop former members from reading member rows — but it would
-- ALSO mean that the Handler-readable view of former members hinges on
-- the Handler being "an active member", which is true today but is the
-- wrong load-bearing assumption: the Handler's right to see member rows
-- comes from being the Handler, not from being a member. So we split the
-- single policy in two: one for active members generally, one explicit
-- Handler policy keyed off `is_campaign_gm`. The Members screen's
-- "Former agents" section reads through the Handler policy.
--
-- A partial index on `(campaign_id, user_id) where status = 'active'`
-- backs the helper hot path. The full `(campaign_id, user_id)` index from
-- the initial schema is left in place — Handler reads of the "former
-- agents" list still benefit from it, and the dedup unique constraint
-- continues to need full coverage.
--
-- Backfill is implicit: `default 'active'` + nullable `left_at` means
-- existing rows are correct on `add column`. The explicit `update`
-- statement is a no-op left in for documentation; removing it would
-- change behaviour by zero rows.

-- ============================================================
-- COLUMNS
-- ============================================================

alter table campaign_members
  add column status text not null default 'active'
    check (status in ('active', 'former'));

alter table campaign_members
  add column left_at timestamptz;

-- Documentation-only backfill. `add column ... default 'active'` already
-- populated every existing row; this update touches zero rows but makes
-- the migration self-documenting for reviewers.
update campaign_members
  set status = 'active'
  where status is null;

-- ============================================================
-- INDEX
-- ============================================================

-- Partial index for the helper hot path. The original
-- `campaign_members_campaign_user_idx` stays in place to serve the
-- Handler's "show me all members including former" reads and the unique
-- (campaign_id, user_id) constraint.
create index campaign_members_active_campaign_user_idx
  on campaign_members(campaign_id, user_id)
  where status = 'active';

-- ============================================================
-- HELPER FUNCTIONS — UPDATED
-- ============================================================
-- Both helpers now require `status = 'active'`. Every RLS policy in the
-- system that routes through these helpers inherits the restriction
-- transitively. Former members lose access to records,
-- record_visibility, linked_records, sessions, and the campaign row
-- itself with no per-policy edits.

create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function is_campaign_gm(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'gm'
      and status = 'active'
  );
$$;

-- ============================================================
-- POLICIES — campaign_members SELECT split
-- ============================================================
-- Drop the single combined policy and replace it with two narrower ones.
-- (1) Active members can read every member row in their campaign — same
-- behaviour as before the helper change.
-- (2) Handlers can read every member row in their campaign regardless of
-- the helper's status filter. This keeps the Members screen's "Former
-- agents" section visible even if the helper semantics shift further in
-- the future. The Handler policy is keyed directly off `is_campaign_gm`,
-- which already requires the caller to be an active Handler — so a
-- former Handler (post-transfer of ownership, M-7c / DEL-49) still loses
-- this access correctly.

drop policy "campaign_members: members can read" on campaign_members;

create policy "campaign_members: active members can read"
  on campaign_members for select
  using (is_campaign_member(campaign_id));

create policy "campaign_members: gm can read all"
  on campaign_members for select
  using (is_campaign_gm(campaign_id));

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor as the former user
-- to confirm the cut-off works)
-- ============================================================
--
--   -- As an authenticated user whose campaign_members row has
--   -- status = 'former' for campaign X, the following should all return 0:
--
--   select count(*) from records          where campaign_id = '<X>';
--   select count(*) from sessions         where campaign_id = '<X>';
--   select count(*) from linked_records   where campaign_id = '<X>';
--   select count(*) from campaigns        where id          = '<X>';
--   select count(*) from record_visibility rv
--     join records r on r.id = rv.record_id
--     where r.campaign_id = '<X>';
--   select count(*) from campaign_members where campaign_id = '<X>';
--
--   -- As the Handler of campaign X, this should still return all
--   -- members including the former ones:
--   select user_id, role, status, left_at from campaign_members
--     where campaign_id = '<X>';
