-- ============================================================
-- Delta Green — Complete Supabase Schema
-- ============================================================
-- This file is the canonical reference. Always keep it in sync
-- with the actual migration files in supabase/migrations/.
--
-- Structure (run order matters):
--   1. Generic helper functions (table-independent)
--   2. All tables + indexes
--   3. RLS enable on all tables
--   4. Table-dependent helper functions
--   5. Policies
--   6. Triggers
--
-- This separation avoids forward-reference errors. Policies and
-- `language sql` functions validate referenced relations at
-- creation time, so per-table grouping causes failures.
-- ============================================================

-- ============================================================
-- 1. GENERIC HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at on row change
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- --- campaigns -----------------------------------------------
create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  codename    text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- --- campaign_members ----------------------------------------
create table campaign_members (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('gm', 'player')),
  plan        text not null default 'free' check (plan in ('free', 'handler', 'program')),
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index campaign_members_campaign_user_idx
  on campaign_members(campaign_id, user_id);

-- --- records -------------------------------------------------
create table records (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  record_type          text not null,
  name                 text not null,
  data                 jsonb not null default '{}',
  tags                 text[] not null default '{}',
  date_encountered     timestamptz,
  visibility_overrides jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,

  constraint record_type_valid check (record_type in (
    'operation',
    'agent', 'civilian', 'poi', 'unnatural',
    'organisation', 'location', 'asset', 'artifact',
    'incident', 'headline', 'global_affair'
  ))
);

create index records_campaign_id_idx on records(campaign_id);
create index records_campaign_type_idx on records(campaign_id, record_type);
create index records_deleted_at_idx on records(deleted_at) where deleted_at is null;
create index records_campaign_date_encountered_idx
  on records(campaign_id, date_encountered)
  where date_encountered is not null;

-- --- record_visibility ---------------------------------------
create table record_visibility (
  id                 uuid primary key default gen_random_uuid(),
  record_id          uuid not null references records(id) on delete cascade,
  campaign_member_id uuid not null references campaign_members(id) on delete cascade,
  is_visible         boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (record_id, campaign_member_id)
);

create index record_visibility_record_id_idx on record_visibility(record_id);
create index record_visibility_member_id_idx on record_visibility(campaign_member_id);

-- --- linked_records ------------------------------------------
create table linked_records (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  record_id_a uuid not null references records(id) on delete cascade,
  record_id_b uuid not null references records(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Prevent self-links (a record linked to itself)
  constraint linked_records_no_self_link check (record_id_a <> record_id_b)
);

create index linked_records_a_idx on linked_records(record_id_a);
create index linked_records_b_idx on linked_records(record_id_b);
create index linked_records_campaign_idx on linked_records(campaign_id);

-- Enforce uniqueness over the unordered pair (A,B) == (B,A).
-- Implemented as a unique index over expressions, since inline
-- UNIQUE constraints in CREATE TABLE only accept bare columns.
create unique index linked_records_unique_pair_idx
  on linked_records (
    least(record_id_a::text, record_id_b::text),
    greatest(record_id_a::text, record_id_b::text)
  );

-- --- sessions ------------------------------------------------
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  operation_id uuid references records(id) on delete set null,
  title        text not null,
  notes        text,
  session_date date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index sessions_campaign_id_idx on sessions(campaign_id);
create index sessions_operation_id_idx on sessions(operation_id);

-- --- player_characters ---------------------------------------
-- User-owned player characters, independent of any campaign. A PC may be
-- attached to a campaign (`campaign_id is not null`) or sitting in the
-- owner's roster (`campaign_id is null`). On hard campaign deletion the FK
-- is `set null` so the PC survives. See DEL-33 migration for full notes.
--
-- After DEL-62, `status` is the pure in-game lifecycle column and
-- `campaign_status` carries the membership concept. The schema-level
-- invariant `(campaign_status = 'assigned') = (campaign_id is not null)`
-- prevents the two halves of the membership representation from drifting.
create table player_characters (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  campaign_id     uuid references campaigns(id) on delete set null,
  name            text not null,
  archetype       text,
  data            jsonb not null default '{}',
  status          text not null default 'active',
  campaign_status text not null default 'unassigned',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint player_characters_status_valid
    check (status in ('active', 'retired', 'deceased')),
  constraint player_characters_campaign_status_valid
    check (campaign_status in ('assigned', 'unassigned')),
  constraint player_characters_campaign_status_matches_campaign_id
    check ((campaign_status = 'assigned') = (campaign_id is not null))
);

create index player_characters_owner_id_idx              on player_characters(owner_id);
create index player_characters_campaign_id_idx           on player_characters(campaign_id);
create index player_characters_owner_campaign_status_idx on player_characters(owner_id, campaign_status);
create index player_characters_deleted_at_idx
  on player_characters(deleted_at)
  where deleted_at is null;

-- --- campaign_invitations ------------------------------------
-- Durable invitations with a state machine. Covers both existing-user
-- invites (invitee_user_id set, no token) and stranger / magic-link
-- invites (invitee_email set, token auto-generated by trigger). The XOR
-- check enforces exactly-one. Partial unique indexes prevent duplicate
-- open invites to the same person for the same campaign while allowing
-- a fresh invite once the previous one moves out of `pending`. See the
-- DEL-34 migration for full notes on the state machine and the public
-- security-definer RPC for token-based reads.
create table campaign_invitations (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  invitee_email   text,
  token           text unique,
  message         text,
  status          text not null default 'pending',
  expires_at      timestamptz not null default (now() + interval '7 days'),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,

  constraint campaign_invitations_status_valid check (status in (
    'pending',
    'accepted',
    'declined',
    'revoked',
    'expired'
  )),

  constraint campaign_invitations_invitee_xor check (
    (invitee_user_id is not null) <> (invitee_email is not null)
  )
);

create index campaign_invitations_campaign_id_idx
  on campaign_invitations(campaign_id);
create index campaign_invitations_invitee_user_id_idx
  on campaign_invitations(invitee_user_id);
create index campaign_invitations_invitee_email_idx
  on campaign_invitations(invitee_email);

-- Partial uniques on (campaign, target) where status = 'pending'.
create unique index campaign_invitations_pending_user_uidx
  on campaign_invitations(campaign_id, invitee_user_id)
  where status = 'pending';

create unique index campaign_invitations_pending_email_uidx
  on campaign_invitations(campaign_id, invitee_email)
  where status = 'pending';

-- --- notifications -------------------------------------------
-- User-facing inbox. Denormalised feed of events relevant to a user.
-- Source is a loose polymorphic pointer (`source_kind` + `source_id`) — no
-- FK, no CHECK on `source_kind` — so new kinds can be added without a
-- migration. Display payload is written once at trigger time so the row
-- survives source deletion. Dismiss = hard DELETE; no soft-delete column.
-- All inserts happen via `security definer` trigger functions; no client
-- INSERT policy. See the DEL-35 migration for full notes on the triggers.
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  source_kind text not null,
  source_id   uuid not null,
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

create index notifications_user_id_idx on notifications(user_id);

-- Unread-feed partial index. Inbox queries are overwhelmingly "show me my
-- unread, newest first"; this keeps the working set small and pre-ordered.
create index notifications_user_unread_idx
  on notifications(user_id, created_at desc)
  where read_at is null;

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table campaigns           enable row level security;
alter table campaign_members    enable row level security;
alter table records             enable row level security;
alter table record_visibility   enable row level security;
alter table linked_records      enable row level security;
alter table sessions            enable row level security;
alter table player_characters   enable row level security;
alter table campaign_invitations enable row level security;
alter table notifications        enable row level security;

-- ============================================================
-- 4. TABLE-DEPENDENT HELPER FUNCTIONS
-- ============================================================
-- Defined after campaign_members exists so sql-language functions
-- can resolve the table reference at creation time.

-- Returns true if the current user is a member of the given campaign
create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
  );
$$;

-- Returns true if the current user is the GM of the given campaign
create or replace function is_campaign_gm(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'gm'
  );
$$;

-- Auto-insert the campaign creator as GM
create or replace function handle_campaign_owner_member()
returns trigger language plpgsql security definer as $$
begin
  insert into campaign_members (campaign_id, user_id, role)
  values (new.id, new.owner_id, 'gm');
  return new;
end;
$$;

-- Auto-generate a single-use hex token for email-only invites. Existing-
-- user invites leave `token` null, so the "tokens only on stranger
-- invites" rule is enforced at the DB rather than relying on every
-- insert path to remember.
create or replace function set_invitation_token()
returns trigger language plpgsql as $$
begin
  if new.invitee_email is not null then
    if new.token is null then
      new.token := encode(gen_random_bytes(24), 'hex');
    end if;
  else
    new.token := null;
  end if;
  return new;
end;
$$;

-- Resolve a user's display handle by reading `user_profiles.username`
-- (DEL-37). Single source of truth for display handles across the
-- notification triggers and `get_invitation_by_token`. Returns null if
-- no profile row exists (shouldn't happen post-backfill).
create or replace function get_user_handle(p_user_id uuid)
returns text language sql security definer stable
set search_path = public
as $$
  select username::text
  from user_profiles
  where user_id = p_user_id;
$$;

-- Fan out an `invite_received` notification when a new invitation is
-- inserted, but ONLY for existing-user invites. Email-only invites are
-- delivered out-of-band by the M-5 email/magic-link flow.
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

-- Fan out `invite_accepted` / `invite_declined` to the inviter when an
-- invitation moves out of `pending`. `revoked` and `expired` are handler /
-- system actions and do NOT fire here. Invitee handle prefers the
-- auth.users lookup, falling back to `invitee_email` for edge cases where
-- the user row isn't linked yet.
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

-- Fan out `campaign_deleted` to every member of the campaign when it
-- transitions into soft-deleted state. The deleter (auth.uid()) is
-- excluded. If there's no JWT, `auth.uid()` is null and the sentinel
-- zero-uuid exclusion is a no-op, so all members get notified — the
-- payload's `deleted_by_username` is null in that case (admin / script).
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
-- 5. POLICIES
-- ============================================================
-- All tables exist by this point; forward references are safe.

-- --- campaigns -----------------------------------------------
create policy "campaigns: members can read"
  on campaigns for select
  using (is_campaign_member(id) and deleted_at is null);

create policy "campaigns: authenticated can create"
  on campaigns for insert
  with check (auth.uid() = owner_id);

create policy "campaigns: gm can update"
  on campaigns for update
  using (is_campaign_gm(id));

-- --- campaign_members ----------------------------------------
create policy "campaign_members: members can read"
  on campaign_members for select
  using (is_campaign_member(campaign_id));

create policy "campaign_members: gm can insert"
  on campaign_members for insert
  with check (is_campaign_gm(campaign_id));

create policy "campaign_members: gm can update"
  on campaign_members for update
  using (is_campaign_gm(campaign_id));

-- --- records -------------------------------------------------
-- GMs see all non-deleted records in their campaigns
create policy "records: gm can read all"
  on records for select
  using (
    deleted_at is null
    and is_campaign_gm(campaign_id)
  );

-- Players see only records explicitly published to them
create policy "records: players see published"
  on records for select
  using (
    deleted_at is null
    and exists (
      select 1
      from record_visibility rv
      join campaign_members cm on cm.id = rv.campaign_member_id
      where rv.record_id = records.id
        and cm.user_id = auth.uid()
        and rv.is_visible = true
    )
  );

create policy "records: gm can insert"
  on records for insert
  with check (is_campaign_gm(campaign_id));

create policy "records: gm can update"
  on records for update
  using (is_campaign_gm(campaign_id));

-- --- record_visibility ---------------------------------------
-- Players can read their own visibility rows
create policy "record_visibility: players can read own"
  on record_visibility for select
  using (
    exists (
      select 1 from campaign_members cm
      where cm.id = record_visibility.campaign_member_id
        and cm.user_id = auth.uid()
    )
  );

-- GMs can read all visibility rows for records in their campaigns
create policy "record_visibility: gm can read all"
  on record_visibility for select
  using (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  );

create policy "record_visibility: gm can insert"
  on record_visibility for insert
  with check (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  );

create policy "record_visibility: gm can update"
  on record_visibility for update
  using (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  );

create policy "record_visibility: gm can delete"
  on record_visibility for delete
  using (
    exists (
      select 1 from records r
      where r.id = record_visibility.record_id
        and is_campaign_gm(r.campaign_id)
    )
  );

-- --- linked_records ------------------------------------------
create policy "linked_records: members can read"
  on linked_records for select
  using (is_campaign_member(campaign_id));

create policy "linked_records: gm can insert"
  on linked_records for insert
  with check (is_campaign_gm(campaign_id));

create policy "linked_records: gm can delete"
  on linked_records for delete
  using (is_campaign_gm(campaign_id));

-- --- sessions ------------------------------------------------
create policy "sessions: members can read"
  on sessions for select
  using (deleted_at is null and is_campaign_member(campaign_id));

create policy "sessions: gm can insert"
  on sessions for insert
  with check (is_campaign_gm(campaign_id));

create policy "sessions: gm can update"
  on sessions for update
  using (is_campaign_gm(campaign_id));

-- --- player_characters ---------------------------------------
-- Owner has full CRUD. Campaign members (incl. Handler) are read-only on
-- PCs attached to their campaign. Owner SELECT intentionally does NOT
-- filter `deleted_at` so the owner can restore soft-deleted PCs; the
-- campaign-member SELECT does filter so deleted PCs disappear for the
-- Handler.
create policy "player_characters: owner can read own"
  on player_characters for select
  using (owner_id = auth.uid());

create policy "player_characters: owner can insert own"
  on player_characters for insert
  with check (owner_id = auth.uid());

create policy "player_characters: owner can update own"
  on player_characters for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "player_characters: owner can delete own"
  on player_characters for delete
  using (owner_id = auth.uid());

create policy "player_characters: campaign members can read attached"
  on player_characters for select
  using (
    campaign_id is not null
    and deleted_at is null
    and is_campaign_member(campaign_id)
  );

-- --- campaign_invitations ------------------------------------
-- Handler has full CRUD on invitations for their campaign(s). DELETE is
-- allowed but should be used for "clean up history" only — normal
-- cancellation goes through the `revoked` status flip so audit + the
-- notifications triggers in DEL-35 work as expected.
--
-- Existing-user invitee can read AND update their own invitation row
-- (accept / decline). Stranger / magic-link reads are NOT covered by
-- RLS; the public surface is the `get_invitation_by_token` security-
-- definer RPC below.
create policy "campaign_invitations: gm can read"
  on campaign_invitations for select
  using (is_campaign_gm(campaign_id));

create policy "campaign_invitations: invitee can read own"
  on campaign_invitations for select
  using (invitee_user_id = auth.uid());

create policy "campaign_invitations: gm can insert"
  on campaign_invitations for insert
  with check (
    is_campaign_gm(campaign_id)
    and invited_by = auth.uid()
  );

create policy "campaign_invitations: gm can update"
  on campaign_invitations for update
  using (is_campaign_gm(campaign_id))
  with check (is_campaign_gm(campaign_id));

create policy "campaign_invitations: invitee can update own"
  on campaign_invitations for update
  using (invitee_user_id = auth.uid())
  with check (invitee_user_id = auth.uid());

create policy "campaign_invitations: gm can delete"
  on campaign_invitations for delete
  using (is_campaign_gm(campaign_id));

-- --- notifications -------------------------------------------
-- User has full read / update / delete on their own rows. The only
-- realistic update is `read_at := now()`. Dismiss = hard DELETE. No
-- INSERT policy by design: all inserts come from the `security definer`
-- trigger functions above, which bypass RLS.
create policy "notifications: user can read own"
  on notifications for select
  using (user_id = auth.uid());

create policy "notifications: user can update own"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: user can delete own"
  on notifications for delete
  using (user_id = auth.uid());

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function handle_updated_at();

create trigger records_updated_at
  before update on records
  for each row execute function handle_updated_at();

create trigger sessions_updated_at
  before update on sessions
  for each row execute function handle_updated_at();

create trigger player_characters_updated_at
  before update on player_characters
  for each row execute function handle_updated_at();

create trigger campaign_invitations_set_token
  before insert on campaign_invitations
  for each row execute function set_invitation_token();

create trigger campaign_owner_becomes_gm
  after insert on campaigns
  for each row execute function handle_campaign_owner_member();

create trigger campaign_invitations_notify_insert
  after insert on campaign_invitations
  for each row execute function notify_on_invitation_insert();

create trigger campaign_invitations_notify_status_change
  after update of status on campaign_invitations
  for each row execute function notify_on_invitation_status_change();

create trigger campaigns_notify_soft_delete
  after update of deleted_at on campaigns
  for each row execute function notify_on_campaign_soft_delete();

-- ============================================================
-- 7. PUBLIC RPCS
-- ============================================================

-- Magic-link lookup for stranger invitations. Returns the minimum fields
-- DEL-45's `/invite/:token` page needs to render the accept screen for
-- an unauthenticated visitor. The table itself is inaccessible to `anon`
-- — this RPC is the only public surface for token-based reads.
--
-- Filters `invitee_email is not null` so existing-user invites can't be
-- enumerated via this path even if their token leaks. Returns zero rows
-- for unknown tokens; the caller treats empty as "invalid".
--
-- Does NOT pre-filter `status` or `expires_at`: DEL-45 needs both to
-- render the correct `InviteGoneScreen` variant.
create or replace function get_invitation_by_token(p_token text)
returns table (
  campaign_name  text,
  inviter_handle text,
  status         text,
  expires_at     timestamptz,
  message        text,
  invitee_email  text
)
language sql security definer stable
set search_path = public
as $$
  select
    c.name              as campaign_name,
    up.username::text   as inviter_handle,
    ci.status,
    ci.expires_at,
    ci.message,
    ci.invitee_email
  from campaign_invitations ci
  join campaigns c          on c.id = ci.campaign_id
  left join user_profiles up on up.user_id = ci.invited_by
  where ci.token = p_token
    and ci.invitee_email is not null;
$$;

grant execute on function get_invitation_by_token(text) to anon, authenticated;

-- ============================================================
-- STORAGE BUCKET: record-photos
-- ============================================================
-- Created manually via Supabase dashboard:
--   Storage → New bucket → name: "record-photos", Public: off
--
-- Storage RLS (Supabase dashboard → Storage → Policies):
--
-- Allow campaign members to read:
--   (storage.foldername(name))[1] is the campaign_id segment
--   Check membership via is_campaign_member(uuid)
--
-- Allow GMs to upload/delete:
--   Check GM role via is_campaign_gm(uuid)
--
-- Path convention: {campaign_id}/{record_id}/{filename}
-- ============================================================