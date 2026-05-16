-- DEL-35 — Add `notifications` table + invitation / campaign-delete triggers.
--
-- The user-facing inbox. Notifications are a denormalised feed of events
-- relevant to a user — invitations today, more sources later. The link back
-- to the source row is a loose polymorphic pointer (`source_kind` +
-- `source_id`); no FK, no CHECK on `source_kind`. The display payload is
-- written once at trigger time so the row survives source deletion: a user
-- still sees "you were invited to X" even if X is later deleted.
--
-- Access model:
--   - Users have full read / update / delete on their own rows. The only
--     real update in practice is setting `read_at`, but the policy stays
--     generic. Dismiss = hard DELETE; notifications are an audit feed, not
--     user content in the records sense, so no `deleted_at`.
--   - INSERT is NOT covered by any RLS policy. All inserts come from
--     trigger functions running as `security definer`, which bypass RLS.
--     Client code cannot create notifications directly — by design.
--
-- Trigger sources (this migration):
--   - `campaign_invitations` INSERT  → `invite_received` to invitee_user_id
--     (skipped for email-only invites; those go via M-5 email path)
--   - `campaign_invitations` UPDATE status pending→accepted → `invite_accepted`
--     to invited_by
--   - `campaign_invitations` UPDATE status pending→declined → `invite_declined`
--     to invited_by
--   - `campaigns` UPDATE deleted_at null→not-null → `campaign_deleted` to
--     all members of that campaign except the deleter
--
-- The `handler_transferred` kind is declared in the CHECK constraint but
-- its trigger lives in M-7c (DEL-49 / transfer-ownership), where the
-- source-of-truth for transfer events is defined.
--
-- Username derivation across all triggers goes through the helper
-- `get_user_handle(uuid)` so the display-name fallback logic
-- (`coalesce(nullif(display_name,''), split_part(email,'@',1))`) lives in
-- one place. Same shape as DEL-34's `get_invitation_by_token`.
--
-- `auth.uid()` inside a `security definer` function still resolves to the
-- calling user's JWT (not the function owner), so `campaign_deleted`'s
-- `deleted_by_username` field correctly identifies the Handler who
-- performed the action. When the soft-delete is performed without a JWT
-- (admin script, SQL console), `auth.uid()` is null and the payload field
-- is null — the notification still fires, just with an unknown deleter.
-- Intentional: doesn't block admin actions, UI can render "deleted" without
-- a name.

-- ============================================================
-- HELPER FUNCTION (table-independent — could be lifted to schema
-- §1 if/when more triggers grow to need it)
-- ============================================================

-- Resolve a user's display handle: prefer `display_name` from
-- raw_user_meta_data, fall back to the email local-part. Returns null only
-- if the input id is null or doesn't exist. Same fallback shape as
-- DEL-34's `get_invitation_by_token` so the display rule is consistent
-- across surfaces.
create or replace function get_user_handle(p_user_id uuid)
returns text language sql security definer stable
set search_path = public, auth
as $$
  select coalesce(
    nullif(u.raw_user_meta_data->>'display_name', ''),
    split_part(u.email, '@', 1)
  )
  from auth.users u
  where u.id = p_user_id;
$$;

-- ============================================================
-- TABLE
-- ============================================================

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  -- Loose polymorphic pointer to the originating row. No FK; no CHECK on
  -- `source_kind`. Today's values are 'campaign_invitation' and 'campaign';
  -- future kinds can introduce new source_kinds without a migration.
  source_kind text not null,
  source_id   uuid not null,
  -- Denormalised display payload, written once at trigger time. Editing a
  -- campaign's name later does NOT propagate here — correct behaviour for
  -- an audit-style inbox.
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now(),

  constraint notifications_kind_valid check (kind in (
    'invite_received',
    'invite_accepted',
    'invite_declined',
    'campaign_deleted',
    'handler_transferred'
  ))
);

-- Tenant-scoping index for "all my notifications" lookups.
create index notifications_user_id_idx on notifications(user_id);

-- Unread-feed index: most inbox queries are "show me my unread, newest
-- first". Partial index keeps it small and ordered.
create index notifications_user_unread_idx
  on notifications(user_id, created_at desc)
  where read_at is null;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table notifications enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================
-- No INSERT policy: all inserts come from the trigger functions below,
-- which run as `security definer` and bypass RLS.

create policy "notifications: user can read own"
  on notifications for select
  using (user_id = auth.uid());

-- The only practical update is `read_at := now()`. The `with check` keeps
-- the row owned by the same user across the update.
create policy "notifications: user can update own"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Dismiss = hard DELETE. Notifications are an audit feed, not user
-- content; no soft-delete semantics.
create policy "notifications: user can delete own"
  on notifications for delete
  using (user_id = auth.uid());

-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- Fan out one `invite_received` notification when a new invitation is
-- inserted, but ONLY for existing-user invites. Email-only invites are
-- delivered out-of-band by the M-5 email/magic-link flow — the recipient
-- has no auth.users row yet, so there's no user_id to notify.
create or replace function notify_on_invitation_insert()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_campaign_name    text;
  v_inviter_username text;
begin
  if new.invitee_user_id is null then
    return new;
  end if;

  select name into v_campaign_name from campaigns where id = new.campaign_id;
  v_inviter_username := get_user_handle(new.invited_by);

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    new.invitee_user_id,
    'invite_received',
    'campaign_invitation',
    new.id,
    jsonb_build_object(
      'campaign_id',       new.campaign_id,
      'campaign_name',     v_campaign_name,
      'inviter_username',  v_inviter_username,
      'invitation_id',     new.id
    )
  );

  return new;
end;
$$;

-- Fan out an `invite_accepted` or `invite_declined` notification to the
-- inviter when the invitation moves out of `pending`. Only fires on the
-- two terminal-by-recipient transitions; `revoked` and `expired` are
-- handler / system actions and don't get notifications here.
--
-- Invitee handle: prefer the auth.users lookup (post-accept the
-- `invitee_user_id` is always set, even for stranger invites that came in
-- with `invitee_email` and got patched at signup). Falls back to
-- `invitee_email` for edge cases where the user row isn't yet linked.
create or replace function notify_on_invitation_status_change()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_kind             text;
  v_campaign_name    text;
  v_invitee_username text;
begin
  if old.status <> 'pending' then
    return new;
  end if;

  if new.status = 'accepted' then
    v_kind := 'invite_accepted';
  elsif new.status = 'declined' then
    v_kind := 'invite_declined';
  else
    return new;
  end if;

  select name into v_campaign_name from campaigns where id = new.campaign_id;

  v_invitee_username := coalesce(
    get_user_handle(new.invitee_user_id),
    new.invitee_email
  );

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    new.invited_by,
    v_kind,
    'campaign_invitation',
    new.id,
    jsonb_build_object(
      'campaign_id',       new.campaign_id,
      'campaign_name',     v_campaign_name,
      'invitee_username',  v_invitee_username
    )
  );

  return new;
end;
$$;

-- Fan out a `campaign_deleted` notification to every member of the
-- campaign when it transitions into soft-deleted state. The deleter
-- themselves is excluded — they performed the action and don't need a
-- notification about it.
--
-- `auth.uid()` resolves to the JWT-bound caller even inside a
-- `security definer` function, so the deleter id is correct. If there's
-- no JWT (admin script / SQL console), `auth.uid()` is null and
-- `deleted_by_username` ends up null in the payload — UI renders "deleted"
-- without a name. We don't gate the trigger on `auth.uid() is not null`
-- because we still want members to be told the campaign is gone.
create or replace function notify_on_campaign_soft_delete()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_deleted_by_username text;
begin
  if not (old.deleted_at is null and new.deleted_at is not null) then
    return new;
  end if;

  v_deleted_by_username := get_user_handle(auth.uid());

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  select
    cm.user_id,
    'campaign_deleted',
    'campaign',
    new.id,
    jsonb_build_object(
      'campaign_id',           new.id,
      'campaign_name',         new.name,
      'deleted_by_username',   v_deleted_by_username
    )
  from campaign_members cm
  where cm.campaign_id = new.id
    and cm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger campaign_invitations_notify_insert
  after insert on campaign_invitations
  for each row execute function notify_on_invitation_insert();

create trigger campaign_invitations_notify_status_change
  after update of status on campaign_invitations
  for each row execute function notify_on_invitation_status_change();

create trigger campaigns_notify_soft_delete
  after update of deleted_at on campaigns
  for each row execute function notify_on_campaign_soft_delete();
