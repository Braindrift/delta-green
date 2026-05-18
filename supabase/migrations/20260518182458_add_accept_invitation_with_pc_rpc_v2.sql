-- DEL-46 — Fix variable/column ambiguity in `accept_invitation_with_pc`.
--
-- The original migration (`20260518181441`) deployed the RPC but tripped a
-- plpgsql "column reference ambiguous" error inside the
-- `insert into campaign_members ... on conflict (campaign_id, user_id) do update`
-- block: `campaign_id` matched both the OUT parameter (declared via
-- `returns table(campaign_id uuid, status text)`) and the `campaign_members`
-- column.
--
-- The fix is a single `#variable_conflict use_column` directive at the top of
-- the function body, which tells plpgsql to resolve ambiguous identifiers
-- to the column when both a variable and a column are in scope. Internal
-- local variables remain `v_`-prefixed so the directive only affects the
-- two genuinely-ambiguous OUT names, not the rest of the function.
--
-- The function body is otherwise identical to the original; redeploying
-- via `create or replace function` carries the rest of the logic forward.

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
  v_user_id     uuid := auth.uid();
  v_campaign_id uuid;
  v_max_agents  int;
  v_seat_count  int;
  v_inv_status  text;
  v_inv_expires timestamptz;
  v_inv_user    uuid;
  v_campaign_deleted timestamptz;
  v_pc_owner    uuid;
  v_pc_campaign uuid;
  v_pc_status   text;
  v_pc_deleted  timestamptz;
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

  select pc.owner_id, pc.campaign_id, pc.status, pc.deleted_at
    into v_pc_owner, v_pc_campaign, v_pc_status, v_pc_deleted
  from player_characters pc
  where pc.id = p_pc_id
  for update;

  if not found
     or v_pc_owner <> v_user_id
     or v_pc_deleted is not null
     or v_pc_campaign is not null
     or v_pc_status <> 'unassigned'
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
     set campaign_id = v_campaign_id,
         status      = 'active'
   where id = p_pc_id;

  return query select v_campaign_id, 'accepted'::text;
end;
$$;
