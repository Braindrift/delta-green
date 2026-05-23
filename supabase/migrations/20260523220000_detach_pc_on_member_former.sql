-- DEL-83 — Detach the leaving / kicked user's PC instead of deleting it.
--
-- Background. DEL-63 wired `demote_pc_on_member_former` to call
-- `_migrate_pc_to_npc_internal()` on every `active → former` transition of
-- a `campaign_members` row, intending to migrate the leaver's PC into a
-- Handler-owned NPC `records` row. The helper does three things: insert the
-- NPC, **hard-delete the `player_characters` row**, and fan out a
-- `pc_detached` notification to active Handlers. The hard-delete is right
-- for the owner-initiated `delete_pc_to_npc` flow (the owner is asking to
-- delete their PC) but wrong for the leave/kick flow: the user did not
-- ask to delete their character, only to leave the campaign.
--
-- The intended mental model is that the PC splits into two unrelated
-- entities at the leave/kick moment:
--   1. A new `records` row in the campaign, mirroring the PC's sheet data
--      under Handler control. The campaign's continuity is preserved.
--   2. The original `player_characters` row stays in the user's roster,
--      now unattached. The user sees the character in the "Available"
--      section of their agent roster and can sign them up to another
--      campaign later.
--
-- This migration introduces `_detach_pc_to_npc_internal`, which runs the
-- same NPC insert + Handler notification as `_migrate_pc_to_npc_internal`
-- but ends with an UPDATE that nulls `campaign_id` and sets
-- `campaign_status = 'unassigned'` instead of deleting the row. The
-- trigger function is rewritten to call the detach helper.
--
-- `_migrate_pc_to_npc_internal` and `delete_pc_to_npc` are deliberately
-- left untouched — that's the owner-initiated path, where the hard-delete
-- is the contract. Two helpers, one shared shape, divergent only on the
-- final write to `player_characters`.
--
-- The schema invariant
--   (campaign_status = 'assigned') = (campaign_id is not null)
-- (DEL-62) holds: both fields move together inside a single UPDATE.
--
-- `player_characters.status` (the in-game lifecycle: active / retired /
-- deceased) is untouched. A user who was playing an `active` PC continues
-- to own an `active` PC; the change is purely the campaign attachment.
--
-- Touches: function bodies only. No DDL. Trigger wiring
-- (`campaign_members_demote_pc_on_former`) stays as wired in DEL-44.

-- ============================================================
-- 1. Internal helper — _detach_pc_to_npc_internal
-- ============================================================
--
-- Same INSERT into `records` and same `pc_detached` notification fan-out
-- as `_migrate_pc_to_npc_internal`. The only difference is the final write
-- on `player_characters`: detach (campaign_id = null, campaign_status =
-- 'unassigned') instead of delete. Not granted to authenticated — invoked
-- only from inside the trigger, which runs as `security definer` and has
-- already established authority by other means.
--
-- Returns the new NPC `records` id, or null when the PC was unattached
-- (nothing to mirror into the campaign — no-op). Matches the contract of
-- `_migrate_pc_to_npc_internal` so the trigger doesn't care which helper
-- it called.

create or replace function _detach_pc_to_npc_internal(p_pc_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_pc                 player_characters%rowtype;
  v_campaign_name      text;
  v_former_owner_name  text;
  v_npc_record_id      uuid;
  v_npc_data           jsonb;
begin
  select * into v_pc
  from player_characters
  where id = p_pc_id
  for update;

  if not found then
    return null;
  end if;

  -- Unattached PC: nothing to mirror, nothing to detach. The leave/kick
  -- trigger shouldn't select these rows (the WHERE clause filters by
  -- `campaign_id = new.campaign_id`), but the guard keeps the helper
  -- composable for any future caller.
  if v_pc.campaign_id is null then
    return null;
  end if;

  v_npc_data := jsonb_strip_nulls(
    jsonb_build_object(
      'role',      'agent',
      'archetype', v_pc.archetype,
      'stats',     v_pc.data -> 'stats',
      'hp',        v_pc.data -> 'hp',
      'wp',        v_pc.data -> 'wp',
      'sanity',    v_pc.data -> 'sanity',
      'notes',     v_pc.data -> 'notes'
    )
  );

  insert into records (campaign_id, record_type, name, data)
  values (v_pc.campaign_id, 'agent', v_pc.name, v_npc_data)
  returning id into v_npc_record_id;

  select name into v_campaign_name from campaigns where id = v_pc.campaign_id;
  v_former_owner_name := get_user_handle(v_pc.owner_id);

  -- Detach instead of delete. Both columns flip together to keep the
  -- `(campaign_status = 'assigned') = (campaign_id is not null)` invariant
  -- satisfied. `status` (the in-game lifecycle column) is untouched.
  update player_characters
     set campaign_id     = null,
         campaign_status = 'unassigned'
   where id = v_pc.id;

  -- Notify every active Handler of the campaign. Single-owner invariant
  -- means this is one row in practice, but the set-based insert remains
  -- correct if the rule loosens.
  insert into notifications (user_id, kind, source_kind, source_id, payload)
  select
    cm.user_id,
    'pc_detached',
    'player_character',
    v_npc_record_id,
    jsonb_build_object(
      'campaign_id',            v_pc.campaign_id,
      'campaign_name',          v_campaign_name,
      'former_owner_username',  v_former_owner_name,
      'pc_name',                v_pc.name,
      'npc_record_id',          v_npc_record_id
    )
  from campaign_members cm
  where cm.campaign_id = v_pc.campaign_id
    and cm.role = 'gm'
    and cm.status = 'active';

  return v_npc_record_id;
end;
$$;

-- ============================================================
-- 2. Re-point the trigger at the detach helper
-- ============================================================
--
-- The trigger fires on UPDATE of `campaign_members`. The active → former
-- transition is the only one we react to (no other status values exist
-- today; the guard keeps the function correct if more are added).

create or replace function demote_pc_on_member_former()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_pc_id uuid;
begin
  if not (new.status = 'former' and old.status = 'active') then
    return new;
  end if;

  -- Product rule: at most one attached PC per (owner, campaign). Loop
  -- keeps the trigger correct if that ever loosens.
  for v_pc_id in
    select id
    from player_characters
    where owner_id    = new.user_id
      and campaign_id = new.campaign_id
  loop
    perform _detach_pc_to_npc_internal(v_pc_id);
  end loop;

  return new;
end;
$$;

-- ============================================================
-- VERIFICATION (commented; covered by the DEL-83 smoke tests run via the
-- Supabase MCP)
-- ============================================================
--
--   -- Player B leaves campaign A while owning PC 'Bob':
--   select leave_campaign('<A>');
--   -- → 'left'
--
--   select id, owner_id, campaign_id, campaign_status, status
--     from player_characters where name = 'Bob';
--   -- → row still exists; campaign_id = null; campaign_status =
--   --   'unassigned'; status unchanged (e.g. 'active').
--
--   select id, name, record_type, data->>'role' from records
--     where campaign_id = '<A>' and record_type = 'agent';
--   -- → new NPC row with name 'Bob', data.role = 'agent', sheet fields
--   --   carried over per the jsonb_build_object policy.
--
--   select count(*) from notifications
--     where kind = 'pc_detached' and source_id = '<new npc id>';
--   -- → one per active Handler of campaign A.
--
--   -- Handler kicks player B from campaign A (whichever surface fires
--   -- the active → former transition): same three checks pass with the
--   -- same outcomes on the kicked user's PC.
--
--   -- Owner-initiated delete (unchanged behaviour, regression check):
--   select delete_pc_to_npc('<unattached pc id>');
--   -- → null; PC row is HARD-deleted from `player_characters`.
