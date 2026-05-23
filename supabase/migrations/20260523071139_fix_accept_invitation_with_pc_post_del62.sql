-- DEL-79 — Repair `accept_invitation_with_pc` for the DEL-62 column split.
--
-- The v2 deployment of this RPC (`20260518182458_…_v2.sql`) predates DEL-62
-- (`20260519123150_split_pc_status_and_campaign_status.sql`), which split
-- `player_characters.status` into two orthogonal columns:
--
--   * `status`          → in-game lifecycle: `active | retired | deceased`
--   * `campaign_status` → membership:       `assigned | unassigned`
--
-- …guarded by `(campaign_status = 'assigned') = (campaign_id is not null)`.
--
-- The v2 body was never updated for that split, so two bugs ride together:
--
--   1. Eligibility gate checks `pc.status <> 'unassigned'`. After DEL-62
--      `'unassigned'` is no longer a valid `status` value — it lives on
--      `campaign_status`. Every real PC fails the gate and the RPC returns
--      `'gone'`, so the invitation never flips to `accepted`, the member
--      row never goes `active`, the campaign never appears in the user's
--      list, and the Handler sees the user stuck as a pending `Invited`
--      row. (Same DEL-62-fallout family as DEL-73.)
--
--   2. The write path sets `campaign_id` and `status = 'active'` but never
--      `campaign_status = 'assigned'`. If the gate ever passed, this would
--      violate the iff invariant from DEL-62.
--
-- This migration rewrites the gate to read the post-split columns and
-- rewrites the write to set the assignment columns the schema actually
-- expects, mirroring `assignPlayerCharacterToCampaign`
-- (`src/lib/player-characters/mutations.ts`) and the
-- `listJoinablePlayerCharacters` filter in `queries.ts`.
--
-- Eligibility post-fix: PC must be owner-owned, not soft-deleted, not
-- attached to any campaign, in-game `status = 'active'` (retired /
-- deceased PCs can't be brought into an operation), and
-- `campaign_status = 'unassigned'` (the membership column).
--
-- Write post-fix: set `campaign_id` AND `campaign_status = 'assigned'` in
-- a single UPDATE so the check constraint is satisfied atomically. The
-- in-game `status` column is no longer touched — the gate already proved
-- it's `'active'`, and `status` is the pure lifecycle column post-DEL-62.
--
-- Everything else (invitation lock + status/expiry/identity checks,
-- campaign deleted/full checks, member upsert, return-code shape) carries
-- forward unchanged; the `#variable_conflict use_column` directive from
-- v2 is preserved.

create or replace function accept_invitation_with_pc(
  p_invitation_id uuid,
  p_pc_id         uuid
)
returns table (
  campaign_id uuid,
  status      text
)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id            uuid := auth.uid();
  v_campaign_id        uuid;
  v_max_agents         int;
  v_seat_count         int;
  v_inv_status         text;
  v_inv_expires        timestamptz;
  v_inv_user           uuid;
  v_campaign_deleted   timestamptz;
  v_pc_owner           uuid;
  v_pc_campaign        uuid;
  v_pc_status          text;
  v_pc_campaign_status text;
  v_pc_deleted         timestamptz;
begin
  if v_user_id is null then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  select ci.campaign_id, ci.status, ci.expires_at, ci.invitee_user_id
    into v_campaign_id, v_inv_status, v_inv_expires, v_inv_user
  from campaign_invitations ci
  where ci.id = p_invitation_id
  for update;

  if not found then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  if v_inv_user is null or v_inv_user <> v_user_id then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  if v_inv_status <> 'pending' or v_inv_expires <= now() then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  select c.max_agents, c.deleted_at
    into v_max_agents, v_campaign_deleted
  from campaigns c
  where c.id = v_campaign_id
  for update;

  if not found or v_campaign_deleted is not null then
    return query select null::uuid, 'deleted'::text;
    return;
  end if;

  select count(*)::int
    into v_seat_count
  from campaign_members cm
  where cm.campaign_id = v_campaign_id
    and cm.status = 'active';

  if v_seat_count >= v_max_agents then
    return query select null::uuid, 'full'::text;
    return;
  end if;

  select pc.owner_id, pc.campaign_id, pc.status, pc.campaign_status, pc.deleted_at
    into v_pc_owner, v_pc_campaign, v_pc_status, v_pc_campaign_status, v_pc_deleted
  from player_characters pc
  where pc.id = p_pc_id
  for update;

  if not found
     or v_pc_owner <> v_user_id
     or v_pc_deleted is not null
     or v_pc_campaign is not null
     or v_pc_status <> 'active'
     or v_pc_campaign_status <> 'unassigned'
  then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  update campaign_invitations
     set status = 'accepted',
         resolved_at = now()
   where id = p_invitation_id;

  insert into campaign_members (campaign_id, user_id, role, status, left_at)
  values (v_campaign_id, v_user_id, 'player', 'active', null)
  on conflict (campaign_id, user_id) do update
    set role    = excluded.role,
        status  = 'active',
        left_at = null;

  update player_characters
     set campaign_id     = v_campaign_id,
         campaign_status = 'assigned'
   where id = p_pc_id;

  return query select v_campaign_id, 'accepted'::text;
end;
$$;
