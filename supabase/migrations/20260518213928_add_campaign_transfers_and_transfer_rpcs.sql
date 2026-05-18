-- DEL-49 — Handler ownership transfer.
--
-- Handler can hand the campaign to another active member, but the recipient
-- must consent — you can't dump campaign ownership on someone without their
-- acceptance. The flow:
--
--   1. Handler picks an active non-Handler member and creates a
--      `campaign_transfers` row with `status = 'pending'`.
--   2. The insert trigger fires a `handler_transfer_requested` notification
--      to the recipient.
--   3. Recipient opens the notification, accepts or declines.
--      - Accept → atomic role swap via `accept_handler_transfer` RPC.
--        Notification `handler_transferred` (already in DEL-35's CHECK list)
--        fires back to the original Handler.
--      - Decline → recipient flips status to `declined` via plain UPDATE
--        under the "recipient can update own" RLS policy. The status-change
--        trigger fires `handler_transfer_declined` to the sender.
--   4. Handler can `cancel` a pending transfer via plain UPDATE under the
--      "sender can update own" RLS policy. No notification — the recipient
--      navigating to a `gone` transfer screen surfaces it on demand, and
--      cancelling-then-re-issuing shouldn't spam the recipient's inbox.
--
-- ## Schema choice
--
-- A new table, not a `kind` column on `campaign_invitations`. Invitations
-- bring new people in; transfers swap roles between existing members. The
-- columns differ (invitations carry `invitee_email`/`token`/`message`/
-- `expires_at`; transfers don't need a token or an email column and don't
-- expire) and the RLS shape differs (invitations have an "invitee can read
-- by token" magic-link surface; transfers are existing-user-only). Forcing
-- both into one table would bloat every invitation read with NULL-filled
-- transfer columns and require a discriminator column on every policy.
--
-- ## Atomicity
--
-- The role-swap on accept is a three-table write:
--   - `campaign_transfers.status = 'accepted'`, `resolved_at = now()`
--   - `campaigns.owner_id = to_user_id`
--   - `campaign_members.role = 'gm'` for the recipient
--   - `campaign_members.role = 'player'` for the original Handler
--
-- The Handler-is-unique invariant (at most one `role = 'gm'` per campaign)
-- isn't enforced at the DB level (no unique constraint exists today), so
-- the role swap MUST land in a single transaction. RLS would otherwise
-- need three separate policy traversals with no shared snapshot; a
-- security-definer RPC with explicit `for update` row locks is the clean
-- shape. Same pattern as `accept_invitation_with_pc` (DEL-46),
-- `leave_campaign` (DEL-47), `soft_delete_campaign` (DEL-48).
--
-- ## Concurrent transfers
--
-- The partial unique index on `(campaign_id) WHERE status = 'pending'`
-- enforces at most one open transfer per campaign at a time. A Handler
-- who wants to switch recipients must cancel the current pending row
-- first. The unique is partial so a completed transfer doesn't block a
-- future one.
--
-- ## Campaign deletion
--
-- `campaign_id` references `campaigns(id) on delete cascade`. If the
-- Handler soft-deletes the campaign (DEL-48) we don't proactively
-- invalidate pending transfers — they remain in the table, but the
-- recipient's screen will resolve the campaign and route to the `deleted`
-- variant of `InviteGoneScreen`. Hard delete of a campaign cascades the
-- transfer row away; the recipient's notification is left dangling
-- (loose polymorphic pointer per DEL-35's design — the source row may not
-- survive).
--
-- ## Notification kinds added
--
-- - `handler_transfer_requested` — recipient, on insert.
-- - `handler_transfer_declined`  — sender, on pending → declined.
--
-- `handler_transferred` was declared in DEL-35's CHECK list ahead of this
-- ticket and fires from the accept RPC.
--
-- Touches: new table `campaign_transfers`; ALTER on `notifications_kind_valid`
-- CHECK constraint; three new triggers; three new RPCs.

-- ============================================================
-- TABLE
-- ============================================================

create table campaign_transfers (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  from_user_id   uuid not null references auth.users(id) on delete cascade,
  to_user_id     uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'pending',
  message        text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,

  constraint campaign_transfers_status_valid check (status in (
    'pending',
    'accepted',
    'declined',
    'cancelled'
  )),
  -- Defensive: a Handler should never be able to target themselves. The
  -- modal filters the picker down to non-Handler members, but the DB-level
  -- check is cheap and protects against a malformed direct insert.
  constraint campaign_transfers_from_to_distinct check (from_user_id <> to_user_id)
);

-- Lookup directions used by the data layer:
--   - Settings page: "is there a pending transfer for this campaign?"
--   - Recipient screen: load by id (RLS scopes to to_user_id).
--   - Future inbox screen: list recipient's pending transfers.
create index campaign_transfers_campaign_id_idx on campaign_transfers(campaign_id);
create index campaign_transfers_to_user_id_idx   on campaign_transfers(to_user_id);
create index campaign_transfers_from_user_id_idx on campaign_transfers(from_user_id);

-- At most one pending transfer per campaign. Releases when the row moves
-- out of `pending`, so re-issuing a transfer after a decline/cancel is
-- always possible.
create unique index campaign_transfers_pending_campaign_uidx
  on campaign_transfers(campaign_id)
  where status = 'pending';

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table campaign_transfers enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================
-- Sender path: Handler inserts, reads back, and can cancel via update.
-- Recipient path: reads their pending transfer and updates it to declined.
-- Accept goes through the security-definer RPC (RLS-bypassing) because the
-- write fans out to two other tables and must maintain the
-- one-Handler-per-campaign invariant.

create policy "campaign_transfers: sender can read own"
  on campaign_transfers for select
  using (from_user_id = auth.uid());

create policy "campaign_transfers: recipient can read own"
  on campaign_transfers for select
  using (to_user_id = auth.uid());

-- Insert: only the current Handler can create a transfer, and only with
-- themselves as `from_user_id`. The CHECK on the table prevents
-- self-targeting; `is_campaign_gm` (initial schema) confirms the caller
-- holds the role at insert time.
create policy "campaign_transfers: gm can insert"
  on campaign_transfers for insert
  with check (
    is_campaign_gm(campaign_id)
    and from_user_id = auth.uid()
  );

-- Sender update: used by `cancelTransfer`. The status-change trigger does
-- not fan out a notification for cancellations (see header).
create policy "campaign_transfers: sender can update own"
  on campaign_transfers for update
  using (from_user_id = auth.uid())
  with check (from_user_id = auth.uid());

-- Recipient update: used by `declineTransfer`. The accept path runs through
-- the security-definer RPC and bypasses this policy.
create policy "campaign_transfers: recipient can update own"
  on campaign_transfers for update
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

-- No DELETE policy. Transfers persist as audit history; cascade from
-- `campaigns` is the only path that removes rows.

-- ============================================================
-- EXTEND notifications_kind_valid
-- ============================================================
-- Two new kinds for the transfer flow. `handler_transferred` is already in
-- the original list from DEL-35.

alter table notifications drop constraint notifications_kind_valid;
alter table notifications add constraint notifications_kind_valid check (kind in (
  'invite_received',
  'invite_accepted',
  'invite_declined',
  'campaign_deleted',
  'handler_transferred',
  'handler_transfer_requested',
  'handler_transfer_declined'
));

-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- Fan out a `handler_transfer_requested` notification to the recipient when
-- a new transfer is inserted. Same shape as `notify_on_invitation_insert` —
-- payload is denormalised at trigger time so a follow-up campaign rename
-- or sender display-name change doesn't propagate.
create or replace function notify_on_transfer_insert()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_campaign_name text;
  v_from_username text;
begin
  select name into v_campaign_name from campaigns where id = new.campaign_id;
  v_from_username := get_user_handle(new.from_user_id);

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    new.to_user_id,
    'handler_transfer_requested',
    'campaign_transfer',
    new.id,
    jsonb_build_object(
      'campaign_id',    new.campaign_id,
      'campaign_name',  v_campaign_name,
      'from_username',  v_from_username,
      'transfer_id',    new.id
    )
  );

  return new;
end;
$$;

-- Fire `handler_transfer_declined` to the sender when the recipient declines.
-- Accept fires from the accept RPC (`handler_transferred`); cancel is silent.
create or replace function notify_on_transfer_decline()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_campaign_name    text;
  v_recipient_handle text;
begin
  if old.status <> 'pending' or new.status <> 'declined' then
    return new;
  end if;

  select name into v_campaign_name from campaigns where id = new.campaign_id;
  v_recipient_handle := get_user_handle(new.to_user_id);

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    new.from_user_id,
    'handler_transfer_declined',
    'campaign_transfer',
    new.id,
    jsonb_build_object(
      'campaign_id',         new.campaign_id,
      'campaign_name',       v_campaign_name,
      'recipient_username',  v_recipient_handle
    )
  );

  return new;
end;
$$;

create trigger campaign_transfers_notify_insert
  after insert on campaign_transfers
  for each row execute function notify_on_transfer_insert();

create trigger campaign_transfers_notify_decline
  after update of status on campaign_transfers
  for each row execute function notify_on_transfer_decline();

-- ============================================================
-- RPC: accept_handler_transfer
-- ============================================================
--
-- Atomic role swap. Locks the transfer row, the campaign row, and both
-- `campaign_members` rows so a concurrent kick / leave / second transfer
-- can't slip past us. Returns a discriminator the client lifts into a
-- typed union:
--
--   - `accepted`         — success.
--   - `gone`             — transfer not pending (already accepted, declined,
--                          cancelled, deleted), or sender no longer an
--                          active Handler, or recipient no longer an active
--                          member.
--   - `not_recipient`    — caller is not the row's `to_user_id`.
--   - `deleted`          — campaign was soft-deleted (or hard-deleted, in
--                          which case the row is gone too — that branch
--                          returns `gone`).
--   - `not_authenticated`— no `auth.uid()`.
--
-- Side effect: inserts a `handler_transferred` notification to the original
-- Handler. Inline here (not a status-change trigger) because we want the
-- payload to include the recipient's username, and a trigger reading
-- post-image `new.to_user_id` would still work — but inline keeps the role
-- swap, status flip, and notification all visible in one function for
-- audit purposes.

create or replace function accept_handler_transfer(p_transfer_id uuid)
returns text
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_user_id          uuid := auth.uid();
  v_campaign_id      uuid;
  v_from_user_id     uuid;
  v_to_user_id       uuid;
  v_status           text;
  v_campaign_deleted timestamptz;
  v_campaign_name    text;
  v_to_handle        text;
  v_from_handle      text;
  v_from_active      boolean;
  v_to_active        boolean;
begin
  if v_user_id is null then
    return 'not_authenticated';
  end if;

  -- Lock the transfer row. A concurrent decline/cancel/accept blocks here
  -- until the other transaction commits, then our visibility check below
  -- catches the status flip.
  select t.campaign_id, t.from_user_id, t.to_user_id, t.status
    into v_campaign_id, v_from_user_id, v_to_user_id, v_status
  from campaign_transfers t
  where t.id = p_transfer_id
  for update;

  if not found then
    return 'gone';
  end if;

  if v_to_user_id <> v_user_id then
    return 'not_recipient';
  end if;

  if v_status <> 'pending' then
    return 'gone';
  end if;

  -- Lock the campaign so a concurrent soft-delete can't land between this
  -- check and the owner_id update.
  select c.deleted_at, c.name
    into v_campaign_deleted, v_campaign_name
  from campaigns c
  where c.id = v_campaign_id
  for update;

  if not found then
    -- Shouldn't happen — the FK is `on delete cascade` so a missing
    -- campaign row means the transfer row would also be gone. Defensive.
    return 'gone';
  end if;

  if v_campaign_deleted is not null then
    return 'deleted';
  end if;

  -- Lock both member rows. We need them both `active`. The sender must
  -- still be the Handler (`role = 'gm'`); the recipient must still hold a
  -- player seat.
  select (status = 'active' and role = 'gm')
    into v_from_active
  from campaign_members
  where campaign_id = v_campaign_id
    and user_id = v_from_user_id
  for update;

  if not found or not coalesce(v_from_active, false) then
    return 'gone';
  end if;

  select (status = 'active')
    into v_to_active
  from campaign_members
  where campaign_id = v_campaign_id
    and user_id = v_to_user_id
  for update;

  if not found or not coalesce(v_to_active, false) then
    return 'gone';
  end if;

  -- Writes. Order matters only loosely (everything commits together) but
  -- we mirror the visible state-machine progression: transfer row first,
  -- then ownership, then roles.
  update campaign_transfers
     set status = 'accepted',
         resolved_at = now()
   where id = p_transfer_id;

  update campaigns
     set owner_id = v_to_user_id
   where id = v_campaign_id;

  update campaign_members
     set role = 'gm'
   where campaign_id = v_campaign_id
     and user_id = v_to_user_id;

  update campaign_members
     set role = 'player'
   where campaign_id = v_campaign_id
     and user_id = v_from_user_id;

  -- Notify the original Handler. Recipient handle is the post-swap winner.
  v_to_handle   := get_user_handle(v_to_user_id);
  v_from_handle := get_user_handle(v_from_user_id);

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    v_from_user_id,
    'handler_transferred',
    'campaign_transfer',
    p_transfer_id,
    jsonb_build_object(
      'campaign_id',        v_campaign_id,
      'campaign_name',      v_campaign_name,
      'new_handler_username', v_to_handle,
      'former_handler_username', v_from_handle
    )
  );

  return 'accepted';
end;
$$;

grant execute on function accept_handler_transfer(uuid) to authenticated;

-- ============================================================
-- VERIFICATION (commented; covered by DEL-49 smoke tests run
-- via the Supabase MCP)
-- ============================================================
--
--   -- Handler inserts a transfer to active member B:
--   insert into campaign_transfers (campaign_id, from_user_id, to_user_id)
--     values ('<c>', auth.uid(), '<b>');
--   -- → row inserted; notification row exists for B with
--   --   kind = 'handler_transfer_requested'.
--
--   -- Second insert while one is pending:
--   insert into campaign_transfers (campaign_id, from_user_id, to_user_id)
--     values ('<c>', auth.uid(), '<other>');
--   -- → 23505 (campaign_transfers_pending_campaign_uidx).
--
--   -- As B: accept.
--   select accept_handler_transfer('<transfer-id>');
--   -- → 'accepted'; campaigns.owner_id = B; B's member row role = 'gm';
--   --   original Handler's row role = 'player'; notification 'handler_transferred'
--   --   exists for the original Handler.
--
--   -- As B: decline (different row).
--   update campaign_transfers set status='declined', resolved_at=now()
--     where id = '<t2>';
--   -- → trigger fires `handler_transfer_declined` to from_user_id.
--
--   -- As the (current) Handler: cancel.
--   update campaign_transfers set status='cancelled', resolved_at=now()
--     where id = '<t3>';
--   -- → no notification, row in cancelled state.
