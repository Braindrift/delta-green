-- DEL-63 — Rewrite `demote_pc_on_member_former` trigger to route through
-- the PC → NPC migration RPC.
--
-- Background. DEL-44 introduced this trigger as a `status = 'former'`
-- demote on the kicked / left member's attached PC. DEL-62 split the
-- overloaded `player_characters.status` column into `status` +
-- `campaign_status` and dropped `'former'` as a valid status value, so
-- the trigger was rewritten as an interim no-op with a TODO pointing at
-- this ticket.
--
-- The new behaviour: on an active → former transition for a
-- `campaign_members` row, run `delete_pc_to_npc(pc.id)` for each PC the
-- leaving / kicked user owns in this campaign. That RPC owns the full
-- migration sequence (NPC record insert, PC delete, Handler notification)
-- and runs inside the same transaction as the membership flip — so the
-- whole "user leaves and PC becomes NPC" sequence is atomic.
--
-- Product rule says a user has at most one PC per campaign; we still
-- express the call as a loop so the trigger remains correct if that rule
-- ever loosens. With one PC the loop runs once.
--
-- Self-kick edge case: a Handler can't kick themselves (UI doesn't expose
-- it; RLS would block it anyway), and a Handler with an attached PC isn't
-- a supported state in v1, so the "Handler kicks themselves while owning
-- a PC in the same campaign" path is unreachable. If it ever became
-- reachable the trigger would still do the right thing — the RPC's auth
-- check uses `auth.uid()`, which inside a `security definer` trigger
-- resolves to the JWT-bound caller, i.e. the Handler performing the
-- update — and `auth.uid() = pc.owner_id` would hold.
--
-- The auth.uid() of the kicked-by user (Handler) is NOT the PC owner in
-- the normal kick path, so a naive direct call to the RPC would raise
-- on the ownership guard. We bypass this by calling the RPC's underlying
-- writes directly from inside the trigger, which runs as `security
-- definer` and therefore bypasses RLS. Rather than duplicate the RPC
-- body, we lift the writes into a shared internal helper.
--
-- Touches: trigger function body only. The trigger wiring
-- (`campaign_members_demote_pc_on_former`) created in DEL-44 stays.

-- ============================================================
-- Internal helper — _migrate_pc_to_npc_internal
-- ============================================================
--
-- Same write sequence as `delete_pc_to_npc` but without the
-- `auth.uid() = pc.owner_id` guard, so callers that already established
-- authority by other means (the trigger; future server-side admin tools)
-- can invoke it. Not granted to authenticated — the only public entry
-- point remains the owner-checked `delete_pc_to_npc`.

create or replace function _migrate_pc_to_npc_internal(p_pc_id uuid)
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

  if v_pc.campaign_id is null then
    delete from player_characters where id = v_pc.id;
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

  delete from player_characters where id = v_pc.id;

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
-- Re-point `delete_pc_to_npc` at the internal helper
-- ============================================================
--
-- Keeps the auth check in the public entry point while sharing the write
-- sequence with the trigger path. Net behaviour is identical to the
-- previous migration's body; the indirection is purely so we don't have
-- two copies of the same INSERT/DELETE/INSERT block to keep in sync.

create or replace function delete_pc_to_npc(p_pc_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner   uuid;
begin
  select owner_id into v_owner
  from player_characters
  where id = p_pc_id;

  if not found then
    return null;
  end if;

  if v_user_id is null or v_owner <> v_user_id then
    raise exception 'not authorised to delete this player character'
      using errcode = '42501';
  end if;

  return _migrate_pc_to_npc_internal(p_pc_id);
end;
$$;

-- ============================================================
-- Rewrite the trigger function body
-- ============================================================

create or replace function demote_pc_on_member_former()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_pc_id uuid;
begin
  -- Fires only on the active → former transition. Other status flips
  -- (none today; the check constraint allows only active/former) and
  -- updates that don't touch status are no-ops.
  if not (new.status = 'former' and old.status = 'active') then
    return new;
  end if;

  -- Per the product rule a user has at most one attached PC per campaign,
  -- but a set-based loop keeps the trigger correct if that ever loosens.
  for v_pc_id in
    select id
    from player_characters
    where owner_id   = new.user_id
      and campaign_id = new.campaign_id
  loop
    perform _migrate_pc_to_npc_internal(v_pc_id);
  end loop;

  return new;
end;
$$;
