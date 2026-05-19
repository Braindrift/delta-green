-- DEL-62 — Split player_characters.status into status + campaign_status.
--
-- Today's `player_characters.status` overloads two orthogonal concepts:
--
--   * in-game lifecycle (active / retired / deceased) — owner-controlled
--   * campaign-membership (assigned / unassigned)    — system-managed by
--     the join/leave/kick flows
--
-- That collapse means a retired PC can't stay attached to its campaign,
-- and a kicked player's PC has to choose between "still walking around
-- in-fiction" and "no longer in this campaign". After this migration the
-- two are independent columns, and `campaign_status` is the source of
-- truth for the roster-grouping question ("does this PC have a campaign
-- right now?").
--
-- The schema-level invariant `(campaign_status = 'assigned') =
-- (campaign_id is not null)` keeps the two halves of the membership
-- representation from drifting. Anything that sets one and not the other
-- will fail the check constraint.
--
-- The `demote_pc_on_member_former` trigger from
-- 20260518100000_member_kick_pc_demote_and_email_lookup.sql used to flip
-- a kicked member's PC to `status = 'former'`. After this migration
-- `'former'` is no longer a valid `status` value (kicked PCs are still
-- walking around in-fiction; membership lives in `campaign_status`
-- instead). The trigger is rewritten to a documented no-op here so the
-- migration is self-consistent; the proper rewrite — kick routes through
-- the PC→NPC migration RPC — lives in DEL-63, the next ticket in this
-- epic.

-- ============================================================
-- 1. Add `campaign_status` column with default + check constraint
-- ============================================================

alter table player_characters
  add column campaign_status text not null default 'unassigned'
    constraint player_characters_campaign_status_valid
      check (campaign_status in ('assigned', 'unassigned'));

-- ============================================================
-- 2. Backfill `campaign_status` from existing `campaign_id`
-- ============================================================

update player_characters
   set campaign_status = 'assigned'
 where campaign_id is not null;

-- ============================================================
-- 3. Backfill legacy `status` values before tightening the check
-- ============================================================
--
-- A kicked / left / unassigned PC is in-fiction still `active`; the
-- membership concept (`unassigned` / `former`) is now carried by
-- `campaign_status` and `campaign_id`. Owners can later move these to
-- `retired` or `deceased` via the existing in-game-status UI.

update player_characters
   set status = 'active'
 where status in ('unassigned', 'former');

-- ============================================================
-- 4. Tighten the `status` check constraint to the three in-game values
-- ============================================================

alter table player_characters
  drop constraint player_characters_status_valid;

alter table player_characters
  add constraint player_characters_status_valid
    check (status in ('active', 'retired', 'deceased'));

-- ============================================================
-- 5. Add the campaign_status / campaign_id invariant
-- ============================================================
--
-- The only schema-level consistency rule between the two columns:
-- `campaign_status = 'assigned'` iff `campaign_id is not null`. Express
-- it as `(... = ...)` so both directions are caught by a single check.

alter table player_characters
  add constraint player_characters_campaign_status_matches_campaign_id
    check ((campaign_status = 'assigned') = (campaign_id is not null));

-- ============================================================
-- 6. Index supporting the roster-grouping query
-- ============================================================
--
-- `/agents` groups by `campaign_status` per owner, so (owner_id,
-- campaign_status) is the natural composite. Keep the existing
-- single-column indexes — they serve other access paths (the
-- campaign-member SELECT policy, joins) and the cost is negligible at
-- v1 row counts.

create index player_characters_owner_campaign_status_idx
  on player_characters(owner_id, campaign_status);

-- ============================================================
-- 7. Rewrite `demote_pc_on_member_former` to a no-op (interim)
-- ============================================================
--
-- TODO(DEL-63): Replace this no-op with a call to the PC→NPC migration
-- RPC. When a member is kicked or leaves, their attached PC should be
-- migrated to a Handler-owned NPC record (preserving session history)
-- rather than silently demoted to a defunct status value. The trigger
-- wiring stays in place so DEL-63 only swaps the function body.
--
-- The previous body referenced `status = 'former'` and
-- `status in ('active', 'unassigned')` — values that no longer exist
-- after this migration. A no-op is the only safe interim behaviour.

create or replace function demote_pc_on_member_former()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Intentional no-op. See DEL-63 for the kick → PC→NPC rewrite. The
  -- previous body wrote `status = 'former'`, which is no longer a valid
  -- `player_characters.status` value after DEL-62.
  return new;
end;
$$;
