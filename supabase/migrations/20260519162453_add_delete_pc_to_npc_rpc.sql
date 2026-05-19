-- DEL-63 — PC → NPC migration RPC + `pc_detached` notification kind.
--
-- "Delete from roster" for a player character is not a soft-delete anymore.
-- The action splits in two:
--
--   1. The `player_characters` row is HARD-deleted from the owner's roster.
--   2. If the PC was attached to a campaign, an NPC `agent` record is
--      inserted into `records` so the campaign retains the character under
--      Handler control (per the design review: "a deleted agent remains as
--      an entry in a campaign it has been part of").
--
-- Both writes plus the Handler notification land in a single transaction
-- (security-definer functions wrap in an implicit txn); if any step
-- fails the whole thing rolls back and the PC remains intact.
--
-- Carry-over policy: shared agent fields move into the NPC `data` pocket;
-- `player_agent`-only fields drop (per `AgentData` in
-- `src/types/records/agent.ts`):
--
--   * carried over: `archetype`, `stats`, `hp`, `wp`, `sanity`, `notes`
--   * dropped:      `motivations`, `bonds`, `disorders`, `adapted`,
--                   `psych_status`, `breaking_point`
--
-- The NPC starts at `data.role = 'agent'` (the NPC sub-mode) and inherits
-- the PC's display `name`. The owner reference is severed — `records` are
-- campaign-scoped, not user-owned.
--
-- Auth model: the RPC checks `auth.uid() = pc.owner_id` and raises on
-- mismatch. RLS already gates writes to `player_characters` to the owner;
-- the explicit guard belongs here too so a future callsite that bypasses
-- RLS (e.g. another security-definer function calling into this one)
-- doesn't accidentally widen the surface. We `raise exception` rather than
-- returning null on auth failure — the client should see a hard error
-- here, not a silent "nothing happened".
--
-- Notification fan-out lives inline (not a separate trigger) so the
-- atomic boundary stays clean and the payload can reference the new NPC
-- record id without a second round-trip.
--
-- Touches: notifications (CHECK extension), function definition,
-- grant to authenticated. No new tables.

-- ============================================================
-- 1. Extend `notifications.kind` CHECK to allow `pc_detached`
-- ============================================================
--
-- Same pattern as the `handler_transferred` extension in DEL-49
-- (`20260518213928_add_campaign_transfers_and_transfer_rpcs.sql`) — drop
-- the existing constraint and re-add it with the new value appended.
-- Postgres has no "alter check constraint add value" primitive.

alter table notifications
  drop constraint notifications_kind_valid;

alter table notifications
  add constraint notifications_kind_valid check (kind in (
    'invite_received',
    'invite_accepted',
    'invite_declined',
    'campaign_deleted',
    'handler_transferred',
    'handler_transfer_requested',
    'handler_transfer_declined',
    'pc_detached'
  ));

-- ============================================================
-- 2. RPC — delete_pc_to_npc
-- ============================================================

create or replace function delete_pc_to_npc(p_pc_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_user_id            uuid := auth.uid();
  v_pc                 player_characters%rowtype;
  v_campaign_name      text;
  v_former_owner_name  text;
  v_npc_record_id      uuid;
  v_npc_data           jsonb;
begin
  -- Lock the PC row. A concurrent retire / update can't slip in between
  -- the read and the delete; a concurrent invocation of this RPC on the
  -- same row will queue and find the row gone on its turn (no-op return).
  select * into v_pc
  from player_characters
  where id = p_pc_id
  for update;

  if not found then
    -- Already deleted, or never existed. Treat as a no-op so concurrent
    -- callers don't see a spurious error.
    return null;
  end if;

  -- Auth guard. RLS would also reject a non-owner UPDATE / DELETE on
  -- `player_characters`, but we're inside a security-definer function
  -- here so RLS doesn't fire — the explicit check is the only gate.
  if v_user_id is null or v_pc.owner_id <> v_user_id then
    raise exception 'not authorised to delete this player character'
      using errcode = '42501';
  end if;

  -- Unassigned-PC path: nothing to migrate, no campaign to notify. Just
  -- delete and return null so the client knows no NPC was produced.
  if v_pc.campaign_id is null then
    delete from player_characters where id = v_pc.id;
    return null;
  end if;

  -- Campaign-attached path. Build the NPC record, then insert, then
  -- delete the PC, then notify the Handler.

  -- Carry-over data. `archetype` is a top-level column on
  -- `player_characters` but a `data` key on the agent record (per
  -- `AgentData` in src/types/records/agent.ts) — promote it here.
  -- `jsonb_strip_nulls` keeps the resulting jsonb tidy when any of the
  -- optional sheet fields aren't set yet (DEF-2 will populate them).
  -- Player-only fields (`motivations`, `bonds`, `disorders`, `adapted`,
  -- `psych_status`, `breaking_point`) are simply not selected — they
  -- drop on migration.
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

  -- We need the campaign name + the former owner's display handle for the
  -- denormalised notification payload (read once, baked in — campaign
  -- renames after the fact do not propagate, matching the rest of the
  -- inbox).
  select name into v_campaign_name from campaigns where id = v_pc.campaign_id;
  v_former_owner_name := get_user_handle(v_pc.owner_id);

  delete from player_characters where id = v_pc.id;

  -- Notify every active Handler of the campaign. In practice this is the
  -- sole Handler (single-owner invariant), but the set-based insert keeps
  -- the trigger correct if the rule ever loosens.
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

grant execute on function delete_pc_to_npc(uuid) to authenticated;

-- ============================================================
-- VERIFICATION (commented; covered by the DEL-63 smoke tests
-- run via the Supabase MCP)
-- ============================================================
--
--   -- Unassigned delete:
--   select delete_pc_to_npc('<unassigned-pc-id>');
--   -- → null; PC row gone; no records / notifications inserted.
--
--   -- Assigned delete:
--   select delete_pc_to_npc('<assigned-pc-id>');
--   -- → uuid of the new NPC record; PC row gone; records row with
--   --   record_type='agent', data->>'role'='agent', notes/stats carried;
--   --   one notification on the campaign's Handler.
--
--   -- Cross-owner attempt:
--   set role authenticated; set request.jwt.claims to '{"sub":"<other>"}';
--   select delete_pc_to_npc('<not-mine>');         -- raises 42501.
