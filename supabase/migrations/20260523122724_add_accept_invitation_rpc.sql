-- DEL-81 — `accept_invitation`: no-PC sibling of `accept_invitation_with_pc`.
--
-- Lets a user accept a campaign invitation without picking or creating an
-- agent. They join as an active `player` with no PC; assignment happens
-- later via the Agent Panel ASSIGN flow (which already filters to
-- campaigns where the user is an active player without a PC) or the
-- Campaign Info Panel ASSIGN button.
--
-- Body is `accept_invitation_with_pc` (post-DEL-79 fix) with every
-- `player_characters` touch removed: no `p_pc_id` arg, no PC lookup, no
-- eligibility gate, no final PC update. Everything else carries forward
-- unchanged so the two RPCs stay behaviourally aligned where they overlap
-- (invitee identity, status/expiry, deleted/full checks, member upsert).
--
-- The member upsert keeps `ON CONFLICT (campaign_id, user_id) DO UPDATE`
-- so a previously-`former` row re-activates cleanly.
--
-- Return shape matches the with-PC RPC: `(campaign_id uuid, status text)`
-- where `status` is one of `accepted | gone | deleted | full`.

create or replace function accept_invitation(
  p_invitation_id uuid
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
  v_user_id          uuid := auth.uid();
  v_campaign_id      uuid;
  v_max_agents       int;
  v_seat_count       int;
  v_inv_status       text;
  v_inv_expires      timestamptz;
  v_inv_user         uuid;
  v_campaign_deleted timestamptz;
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

  return query select v_campaign_id, 'accepted'::text;
end;
$$;
