-- DEL-46 — Atomic accept-invitation-with-PC RPC.
--
-- The accept-invite flow needs three writes to land together or not at all:
--
--   1. `campaign_invitations` → status = 'accepted', resolved_at = now()
--   2. `campaign_members`      → insert role='player', status='active' (or
--                                 flip a 'former' row back to 'active' if the
--                                 invitee was previously kicked / left)
--   3. `player_characters`     → selected PC's campaign_id set, status='active'
--
-- Doing this client-side in sequence would leave the user half-joined if any
-- step failed, and the second + third writes also need to observe the seat
-- count + invitation state set by the first — so a single `security definer`
-- RPC with explicit `for update` row locks is the clean path. RLS would
-- otherwise force three separate policy traversals with no shared snapshot.
--
-- Failure discriminator. Rather than raising distinct exceptions per
-- terminal state the caller has to parse out of error strings, the RPC
-- returns a `(campaign_id, status)` row where `status` is one of:
--
--   - `'accepted'` — success; `campaign_id` populated.
--   - `'gone'`     — invitation is not pending (revoked / accepted /
--                     declined / expired). Caller refetches the invitation
--                     via `getInvitationForAccept` to pick the right
--                     `InviteGoneScreen` variant.
--   - `'deleted'`  — campaign was soft-deleted.
--   - `'full'`     — active seat count is >= max_agents.
--
-- A row is always returned. `campaign_id` is null for every non-`accepted`
-- branch. This lets the caller pattern-match on a single discriminator
-- without a follow-up round-trip on the success path.
--
-- Auth + identity. The function checks `auth.uid() = invitee_user_id` itself;
-- the SECURITY DEFINER bypasses RLS so we don't get a free check from the
-- existing "invitee can update own" policy. The caller's session must
-- supply `auth.uid()` — anon callers get back `null` and a generic
-- 'gone' (we don't distinguish "not signed in" from "wrong user" by
-- design; the UI guards anon callers with `ProtectedRoute` anyway).
--
-- PC ownership. The PC must be owned by the caller, soft-delete null,
-- status='unassigned', and not already attached to a campaign. The PC's
-- status moves to 'active' to mirror the join flow that `campaign_members`
-- doesn't itself track on the PC side.
--
-- Re-join semantics. A previously-kicked or self-leave member has a row
-- with `status = 'former'` and `left_at` set. Accepting a fresh invite
-- flips the existing row back to active (preserving the original
-- created_at) rather than inserting a duplicate — the
-- `campaign_members_campaign_user_uidx` would reject the second insert
-- and the user would see a generic error. An UPSERT via ON CONFLICT
-- keeps the path total.
--
-- Touches: campaign_invitations, campaign_members, player_characters

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

  -- Lock the invitation row so a concurrent accept can't race past us.
  -- A `for update` here also blocks the Handler's revoke path for the
  -- duration, which is the behaviour we want — last-writer-wins on
  -- contested invites was a known ambiguity in DEL-34's design notes.
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
    -- Either a stranger invite that hasn't been claimed yet (UI bug if we
    -- got here) or someone else's invitation. Same opaque 'gone' return
    -- so the page falls back to the standard refetch + InviteGoneScreen.
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  if v_inv_status <> 'pending' or v_inv_expires <= now() then
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  -- Lock the campaign row so the seat-count check can't be invalidated by
  -- a concurrent accept on a different invitation for the same campaign.
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
  from campaign_members
  where campaign_members.campaign_id = v_campaign_id
    and campaign_members.status = 'active';

  if v_seat_count >= v_max_agents then
    return query select null::uuid, 'full'::text;
    return;
  end if;

  -- PC validation. Lock so a concurrent retire/delete from another tab
  -- can't slip the PC out from under the accept.
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
    -- PC no longer eligible. Treat as 'gone' so the page refetches and
    -- the user sees a sensible fallback (refresh pulls a new PC list).
    -- The UI also re-validates client-side before submitting.
    return query select null::uuid, 'gone'::text;
    return;
  end if;

  -- Writes.

  update campaign_invitations
     set status = 'accepted',
         resolved_at = now()
   where id = p_invitation_id;

  -- Upsert: re-joining a campaign the caller was previously kicked from
  -- (status='former') flips the existing row back to active. The unique
  -- index on (campaign_id, user_id) makes ON CONFLICT exact.
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

grant execute on function accept_invitation_with_pc(uuid, uuid) to authenticated;

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor to confirm)
-- ============================================================
--
--   -- Happy path: pending invitation + unassigned PC.
--   select * from accept_invitation_with_pc(
--     '<invitation-id>'::uuid,
--     '<pc-id>'::uuid
--   );
--   -- → (campaign_id, 'accepted')
--
--   -- Full campaign: insert N active members up to max_agents, then call.
--   -- → (null, 'full')
--
--   -- Deleted campaign: `update campaigns set deleted_at=now() where ...`
--   -- → (null, 'deleted')
--
--   -- Wrong invitee: call as a user whose id != invitee_user_id.
--   -- → (null, 'gone')
