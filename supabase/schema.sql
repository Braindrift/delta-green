-- ============================================================
-- Delta Green — Complete Supabase Schema
-- ============================================================
-- Canonical, human-readable reference for the `public` schema as it
-- exists on the linked remote project. It is NOT applied directly —
-- migrations in `supabase/migrations/` are the only thing `db push`
-- runs. This file is the cumulative picture those migrations add up to,
-- kept readable for humans and AI sessions getting oriented.
--
-- Keep it in sync: every migration ticket should refresh the relevant
-- section here (see CLAUDE.md § "Applying schema migrations"). When in
-- doubt, the live DB wins — this file was last reconciled against it by
-- introspecting pg_catalog (DEL-86), since `supabase db dump` requires a
-- local Docker stack we don't run.
--
-- Platform-managed objects are intentionally omitted: the `citext`
-- operator/function family beyond the `create extension` line, the
-- Supabase `ensure_rls` event trigger and its `rls_auto_enable()`
-- function (owned by `postgres`, not created by any repo migration),
-- and the default role grants Supabase attaches to every new function.
--
-- Structure (run order matters):
--   1. Generic helper functions (table-independent)
--   2. Extensions
--   3. All tables + indexes
--   4. RLS enable on all tables
--   5. Table-dependent helper + trigger functions
--   6. Policies
--   7. Triggers
--   8. Client-callable RPCs (security definer)
--   9. Realtime publication
--  10. Function execute grants
--
-- This separation avoids forward-reference errors. Policies and
-- `language sql` functions validate referenced relations at creation
-- time, so per-table grouping causes failures.
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
-- 2. EXTENSIONS
-- ============================================================
-- `citext` (case-insensitive text) backs `user_profiles.username` so the
-- UNIQUE constraint enforces case-insensitive uniqueness without a
-- functional index. Ships with Supabase; `if not exists` keeps it
-- idempotent. (DEL-37)

create extension if not exists citext;

-- ============================================================
-- 3. TABLES
-- ============================================================

-- --- campaigns -----------------------------------------------
create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  codename    text,
  description text,
  -- Per-campaign agent cap chosen at creation. Real column (not settings
  -- JSONB) so it's queryable and constraint-checked. Default 6 matches the
  -- creation form. (DEL-42)
  max_agents  int not null default 6 check (max_agents between 1 and 12),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- --- campaign_members ----------------------------------------
-- `status` + `left_at` model soft-leave (player leaves) and Handler-kick
-- (player removed) without losing the historical membership row. The
-- helpers `is_campaign_member` / `is_campaign_gm` both require
-- `status = 'active'`, so a row flipping to 'former' loses access to the
-- campaign's data transitively through every helper-routed policy. (DEL-36)
create table campaign_members (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('gm', 'player')),
  plan        text not null default 'free' check (plan in ('free', 'handler', 'program')),
  status      text not null default 'active' check (status in ('active', 'former')),
  left_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, user_id)
);

-- Full-coverage index: serves the unique (campaign_id, user_id) dedup and
-- the Handler's "all members incl. former" reads.
create index campaign_members_campaign_user_idx
  on campaign_members(campaign_id, user_id);

-- Partial index backing the helper hot path (active membership lookups).
create index campaign_members_active_campaign_user_idx
  on campaign_members(campaign_id, user_id)
  where status = 'active';

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
--
-- NOTE: `status` defaults to 'unassigned', which is NOT a valid value
-- under the post-DEL-62 `status` CHECK ('active','retired','deceased').
-- This is a latent inconsistency: DEL-62 retargeted the column's meaning
-- and tightened the CHECK but never altered the column default. It bites
-- nothing today because every insert path sets `status` explicitly; a
-- bare insert relying on the default would fail the CHECK. Reproduced here
-- to match live. (Tracked for a follow-up default fix.)
create table player_characters (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  campaign_id     uuid references campaigns(id) on delete set null,
  name            text not null,
  archetype       text,
  data            jsonb not null default '{}',
  status          text not null default 'unassigned',
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
-- All inserts happen via `security definer` trigger/RPC functions; no
-- client INSERT policy. See the DEL-35 migration for full notes.
--
-- `kind` CHECK has grown over time: the transfer kinds arrived with DEL-49
-- and `pc_detached` with DEL-63's detach-on-former flow.
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
    'handler_transferred',
    'handler_transfer_requested',
    'handler_transfer_declined',
    'pc_detached'
  ))
);

create index notifications_user_id_idx on notifications(user_id);

-- Unread-feed partial index. Inbox queries are overwhelmingly "show me my
-- unread, newest first"; this keeps the working set small and pre-ordered.
create index notifications_user_unread_idx
  on notifications(user_id, created_at desc)
  where read_at is null;

-- --- user_profiles -------------------------------------------
-- Publicly-readable (to authenticated users) username surface for the
-- "Find user" invite tab, so usernames resolve to user ids without
-- touching per-user-private `auth.users.raw_user_meta_data`. One row per
-- auth user, kept in lockstep by the `on_auth_user_created` trigger.
-- `citext` username makes `=` case-insensitive, so the UNIQUE constraint
-- enforces case-insensitive uniqueness directly. (DEL-37)
create table user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   citext not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The unique constraint on `username` already creates the btree index the
-- "Find user" lookup (`where username = $1`) needs. No extra index.

-- --- campaign_transfers --------------------------------------
-- Handler ownership transfer with recipient consent. A separate table from
-- campaign_invitations: invitations bring new people in, transfers swap
-- roles between existing members (no token / email / expiry). The accept
-- path is the `accept_handler_transfer` RPC (atomic three-table role swap);
-- decline / cancel are plain UPDATEs under the recipient / sender policies.
-- The partial unique index allows at most one pending transfer per
-- campaign at a time. (DEL-49)
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
  -- Defensive: a Handler should never be able to target themselves.
  constraint campaign_transfers_from_to_distinct check (from_user_id <> to_user_id)
);

create index campaign_transfers_campaign_id_idx on campaign_transfers(campaign_id);
create index campaign_transfers_to_user_id_idx   on campaign_transfers(to_user_id);
create index campaign_transfers_from_user_id_idx on campaign_transfers(from_user_id);

-- At most one pending transfer per campaign. Releases when the row moves
-- out of `pending`, so re-issuing after a decline/cancel is always possible.
create unique index campaign_transfers_pending_campaign_uidx
  on campaign_transfers(campaign_id)
  where status = 'pending';

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table campaigns            enable row level security;
alter table campaign_members     enable row level security;
alter table records              enable row level security;
alter table record_visibility    enable row level security;
alter table linked_records       enable row level security;
alter table sessions             enable row level security;
alter table player_characters    enable row level security;
alter table campaign_invitations enable row level security;
alter table notifications        enable row level security;
alter table user_profiles        enable row level security;
alter table campaign_transfers   enable row level security;

-- ============================================================
-- 5. TABLE-DEPENDENT HELPER + TRIGGER FUNCTIONS
-- ============================================================
-- Defined after the tables exist so sql-language functions can resolve
-- their table references at creation time.

-- Returns true if the current user is an ACTIVE member of the campaign.
-- The `status = 'active'` filter is the load-bearing soft-leave cut-off:
-- every helper-routed read policy inherits it. (DEL-36)
create or replace function is_campaign_member(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- Returns true if the current user is the ACTIVE GM of the campaign.
create or replace function is_campaign_gm(p_campaign_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'gm'
      and status = 'active'
  );
$$;

-- Auto-insert the campaign creator as GM.
create or replace function handle_campaign_owner_member()
returns trigger language plpgsql security definer as $$
begin
  insert into campaign_members (campaign_id, user_id, role)
  values (new.id, new.owner_id, 'gm');
  return new;
end;
$$;

-- Auto-generate a single-use hex token for email-only invites. Existing-
-- user invites leave `token` null, enforcing the "tokens only on stranger
-- invites" rule at the DB rather than per insert path.
create or replace function set_invitation_token()
returns trigger language plpgsql as $$
begin
  if new.invitee_email is not null then
    -- 24 random bytes → 48 hex chars → 192 bits of entropy. Plenty for a
    -- single-use magic-link token, URL-safe without further encoding.
    if new.token is null then
      new.token := encode(gen_random_bytes(24), 'hex');
    end if;
  else
    new.token := null;
  end if;
  return new;
end;
$$;

-- Generate a unique username from an email + optional metadata override.
-- Tries metadata, then the email local-part (alphanumerics, lowercased),
-- then literal 'user'; suffixes -2, -3, … until free. Volatile (the
-- collision check is a live read). (DEL-37)
create or replace function generate_unique_username(
  p_email             text,
  p_metadata_username text default null
)
returns citext
language plpgsql security definer
set search_path = public
as $$
declare
  v_base      text;
  v_candidate citext;
  v_suffix    int := 1;
begin
  -- Pick the base. Metadata wins; email local-part is the fallback;
  -- literal 'user' covers the pathological case (e.g. an email like
  -- `@foo.com` that strips to nothing, or a null email).
  v_base := nullif(trim(coalesce(p_metadata_username, '')), '');

  if v_base is null then
    v_base := regexp_replace(
      lower(split_part(coalesce(p_email, ''), '@', 1)),
      '[^a-z0-9]', '', 'g'
    );
  end if;

  if v_base is null or v_base = '' then
    v_base := 'user';
  end if;

  v_candidate := v_base::citext;

  -- Spin the suffix until we find a free slot. Cheap: the unique
  -- index on username makes each probe a single B-tree lookup.
  while exists (select 1 from user_profiles where username = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := (v_base || '-' || v_suffix)::citext;
  end loop;

  return v_candidate;
end;
$$;

-- Resolve a user's display handle from `user_profiles.username`. Single
-- source of truth for handles across the notification triggers and
-- token-based RPCs. Returns null if no profile row exists. (DEL-37)
create or replace function get_user_handle(p_user_id uuid)
returns text language sql security definer stable
set search_path = public
as $$
  select username::text
  from user_profiles
  where user_id = p_user_id;
$$;

-- Auto-create a `user_profiles` row when a new auth user signs up. Reads
-- optional `username` from signup metadata; `generate_unique_username`
-- handles the fallback chain and suffix-on-collision. (DEL-37)
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_metadata_username text;
  v_username          citext;
begin
  v_metadata_username := new.raw_user_meta_data->>'username';
  v_username := generate_unique_username(new.email, v_metadata_username);

  insert into user_profiles (user_id, username)
  values (new.id, v_username);

  return new;
end;
$$;

-- Fan out an `invite_received` notification on insert, but ONLY for
-- existing-user invites. Email-only invites are delivered out-of-band by
-- the magic-link flow.
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
-- invitation moves out of `pending`. `revoked` / `expired` do NOT fire.
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

-- Fan out `campaign_deleted` to every ACTIVE member (excluding the
-- deleter) when a campaign transitions into soft-deleted state. (DEL-35,
-- former-skip added DEL-#57.)
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
    and cm.status = 'active'
    and cm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

-- Fan out `handler_transfer_requested` to the recipient on transfer
-- insert. Payload denormalised at trigger time. (DEL-49)
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

-- Fire `handler_transfer_declined` to the sender when the recipient
-- declines. Accept fires `handler_transferred` from the accept RPC; cancel
-- is silent. (DEL-49)
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

-- Internal: convert a PC into a campaign-scoped 'agent' NPC record and
-- HARD DELETE the PC. Called only from `delete_pc_to_npc` (owner-initiated
-- delete). Notifies active GMs with `pc_detached`. Execute is revoked from
-- all client roles (DEL-84); runs as owner from its caller. (DEL-63)
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

-- Internal: like `_migrate_pc_to_npc_internal` but DETACHES the PC
-- (campaign_id → null, campaign_status → 'unassigned') instead of deleting
-- it, leaving a Handler-owned 'agent' NPC behind. Called from the
-- demote-on-former trigger when a member leaves/is kicked. Execute revoked
-- from all client roles (DEL-84). (DEL-63)
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

  update player_characters
     set campaign_id     = null,
         campaign_status = 'unassigned'
   where id = v_pc.id;

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

-- When a member flips active → former, detach each of their PCs attached
-- to that campaign into Handler-owned NPCs (preserves session history
-- instead of silently demoting). Wiring stayed in place across DEL-62's
-- interim no-op; DEL-63 swapped in this body. (DEL-63)
create or replace function demote_pc_on_member_former()
returns trigger language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_pc_id uuid;
begin
  if not (new.status = 'former' and old.status = 'active') then
    return new;
  end if;

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
-- 6. POLICIES
-- ============================================================
-- All tables exist by this point; forward references are safe.

-- --- campaigns -----------------------------------------------
create policy "campaigns: members can read"
  on campaigns for select
  using (
    deleted_at is null
    and (auth.uid() = owner_id or is_campaign_member(id))
  );

-- A pending invitee (existing user) can read the campaign row so the
-- invite screen can render its name before they accept. (DEL-#57 / DEL-58)
create policy "campaigns: pending invitee can read"
  on campaigns for select
  using (
    deleted_at is null
    and exists (
      select 1
      from campaign_invitations ci
      where ci.campaign_id = campaigns.id
        and ci.invitee_user_id = auth.uid()
        and ci.status = 'pending'
        and ci.expires_at > now()
    )
  );

create policy "campaigns: authenticated can create"
  on campaigns for insert
  with check (auth.uid() = owner_id);

create policy "campaigns: gm can update"
  on campaigns for update
  using (is_campaign_gm(id));

-- --- campaign_members ----------------------------------------
-- SELECT split in two: active members read member rows generally; the
-- Handler reads ALL member rows (incl. former) keyed off is_campaign_gm.
-- The "members can read active" policy also requires the READ row itself
-- to be active, so former rows are hidden from non-Handler members. (DEL-36,
-- tightened DEL-#... member-read.)
create policy "campaign_members: members can read active"
  on campaign_members for select
  using (status = 'active' and is_campaign_member(campaign_id));

create policy "campaign_members: gm can read all"
  on campaign_members for select
  using (is_campaign_gm(campaign_id));

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
-- notification triggers work as expected.
--
-- Existing-user invitee can read AND update their own invitation row
-- (accept / decline). Stranger / magic-link reads are NOT covered by
-- RLS; the public surface is the `get_invitation_by_token` RPC below.
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
-- INSERT policy by design: all inserts come from `security definer`
-- trigger / RPC functions, which bypass RLS.
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

-- --- user_profiles -------------------------------------------
-- SELECT open to every authenticated user (the whole point is cross-tenant
-- username lookup — NOT campaign-scoped). `anon` has no access. INSERT is
-- trigger-only; DELETE cascades from auth.users; UPDATE is owner-only. (DEL-37)
create policy "user_profiles: authenticated can read"
  on user_profiles for select
  to authenticated
  using (true);

create policy "user_profiles: owner can update own"
  on user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- campaign_transfers --------------------------------------
-- Sender (Handler) inserts, reads back, and cancels via update. Recipient
-- reads their pending transfer and updates it to declined. Accept goes
-- through the security-definer RPC (RLS-bypassing). No DELETE policy;
-- transfers persist as audit history, removed only by campaign cascade. (DEL-49)
create policy "campaign_transfers: sender can read own"
  on campaign_transfers for select
  using (from_user_id = auth.uid());

create policy "campaign_transfers: recipient can read own"
  on campaign_transfers for select
  using (to_user_id = auth.uid());

create policy "campaign_transfers: gm can insert"
  on campaign_transfers for insert
  with check (
    is_campaign_gm(campaign_id)
    and from_user_id = auth.uid()
  );

create policy "campaign_transfers: sender can update own"
  on campaign_transfers for update
  using (from_user_id = auth.uid())
  with check (from_user_id = auth.uid());

create policy "campaign_transfers: recipient can update own"
  on campaign_transfers for update
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

-- ============================================================
-- 7. TRIGGERS
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

create trigger user_profiles_updated_at
  before update on user_profiles
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

create trigger campaign_members_demote_pc_on_former
  after update of status on campaign_members
  for each row execute function demote_pc_on_member_former();

create trigger campaign_transfers_notify_insert
  after insert on campaign_transfers
  for each row execute function notify_on_transfer_insert();

create trigger campaign_transfers_notify_decline
  after update of status on campaign_transfers
  for each row execute function notify_on_transfer_decline();

-- Auth-schema trigger: auto-create a profile row on signup. (DEL-37)
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================
-- 8. CLIENT-CALLABLE RPCS (security definer)
-- ============================================================

-- Magic-link lookup for stranger invitations. The only public surface for
-- token-based reads (the table is inaccessible to `anon`). Filters
-- `invitee_email is not null` so existing-user invites can't be enumerated
-- even if their token leaks. Does NOT pre-filter status/expiry — the
-- caller needs both to render the right "invite gone" variant. (DEL-34)
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

-- Resolve a user id by email for the "Find user" invite path. Authenticated
-- only (anon revoked, DEL-84) to prevent email enumeration. (DEL-#46)
create or replace function find_user_by_email(p_email text)
returns uuid
language sql security definer stable
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

-- Accept an existing-user invitation (no PC). Locks the invitation and
-- campaign rows, enforces the max_agents seat cap, then flips the invite to
-- accepted and upserts an active member row. Returns (campaign_id, status)
-- where status ∈ accepted | gone | deleted | full. (DEL-46, post-DEL-62)
create or replace function accept_invitation(p_invitation_id uuid)
returns table (campaign_id uuid, status text)
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

-- Accept an existing-user invitation AND attach an unassigned PC in one
-- atomic write. Same seat-cap / state checks as `accept_invitation`, plus
-- validation that the PC is the caller's, undeleted, unassigned, and in
-- 'active' in-game status. (DEL-46, rewritten post-DEL-62)
create or replace function accept_invitation_with_pc(p_invitation_id uuid, p_pc_id uuid)
returns table (campaign_id uuid, status text)
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

-- Claim an email/magic-link invitation as the now-authenticated recipient,
-- but only if the caller's verified email matches the invite's. Converts
-- the email invite into an existing-user invite (sets invitee_user_id,
-- clears email + token). Authenticated only (anon revoked, DEL-85). (DEL-#)
create or replace function claim_invitation_by_token(p_token text)
returns table (invitation_id uuid, campaign_id uuid)
language plpgsql security definer
set search_path = public, auth
as $$
declare
  caller_email text;
begin
  if auth.uid() is null then
    return;
  end if;

  select lower(email) into caller_email
  from auth.users
  where id = auth.uid();

  if caller_email is null then
    return;
  end if;

  return query
  update campaign_invitations ci
     set invitee_user_id = auth.uid(),
         invitee_email   = null,
         token           = null
   where ci.token = p_token
     and ci.status = 'pending'
     and ci.expires_at > now()
     and ci.invitee_email is not null
     and lower(ci.invitee_email) = caller_email
     and ci.invitee_user_id is null
  returning ci.id, ci.campaign_id;
end;
$$;

-- Decline an email/magic-link invitation by token. Authenticated only
-- (anon revoked, DEL-85); the body no-ops for anon anyway. (DEL-#)
create or replace function decline_invitation_by_token(p_token text)
returns table (invitation_id uuid)
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  update campaign_invitations ci
     set status = 'declined',
         resolved_at = now()
   where ci.token = p_token
     and ci.status = 'pending'
     and ci.expires_at > now()
     and ci.invitee_email is not null
  returning ci.id;
end;
$$;

-- Soft-leave the campaign (player only). Sets the caller's member row to
-- former + left_at. Returns left | not_authenticated | not_member |
-- is_handler. The active → former flip fires the demote-PC trigger. (DEL-47)
create or replace function leave_campaign(p_campaign_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_row campaign_members%rowtype;
begin
  if caller_id is null then
    return 'not_authenticated';
  end if;

  select * into caller_row
  from campaign_members
  where campaign_id = p_campaign_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    return 'not_member';
  end if;

  if caller_row.role = 'gm' then
    return 'is_handler';
  end if;

  update campaign_members
     set status  = 'former',
         left_at = now()
   where id = caller_row.id;

  return 'left';
end;
$$;

-- Soft-delete a campaign (Handler only). Locks the caller's membership row,
-- refuses non-Handlers, then stamps deleted_at (idempotent). The
-- deleted_at flip fires the campaign_deleted notification trigger. Returns
-- deleted | not_authenticated | not_member | not_handler. (DEL-48)
create or replace function soft_delete_campaign(p_campaign_id uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  if caller_id is null then
    return 'not_authenticated';
  end if;

  -- Lock the caller's membership row to prevent a concurrent role transfer
  -- (DEL-49) flipping us between the read and the update.
  select role into caller_role
  from campaign_members
  where campaign_id = p_campaign_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    -- No active membership: never joined, already left/kicked, or the
    -- campaign was soft-deleted concurrently. Indistinguishable to the
    -- caller for the same information-leak reason as leave_campaign.
    return 'not_member';
  end if;

  if caller_role <> 'gm' then
    return 'not_handler';
  end if;

  -- Defensive idempotency: a no-op update (already deleted) skips the
  -- notification fan-out because the trigger guards on the null → not-null
  -- transition.
  update campaigns
     set deleted_at = now()
   where id = p_campaign_id
     and deleted_at is null;

  return 'deleted';
end;
$$;

-- Atomic Handler ownership transfer accept. Locks the transfer, campaign,
-- and both member rows; verifies the sender is still the active Handler and
-- the recipient still an active member; swaps owner_id + roles; notifies
-- the former Handler with `handler_transferred`. Returns accepted | gone |
-- not_recipient | deleted | not_authenticated. (DEL-49)
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
    return 'gone';
  end if;

  if v_campaign_deleted is not null then
    return 'deleted';
  end if;

  -- Lock both member rows. The sender must still be the active Handler; the
  -- recipient must still hold an active seat.
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

  -- Writes mirror the visible state-machine progression: transfer row,
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

  v_to_handle   := get_user_handle(v_to_user_id);
  v_from_handle := get_user_handle(v_from_user_id);

  insert into notifications (user_id, kind, source_kind, source_id, payload)
  values (
    v_from_user_id,
    'handler_transferred',
    'campaign_transfer',
    p_transfer_id,
    jsonb_build_object(
      'campaign_id',              v_campaign_id,
      'campaign_name',            v_campaign_name,
      'new_handler_username',     v_to_handle,
      'former_handler_username',  v_from_handle
    )
  );

  return 'accepted';
end;
$$;

-- Owner-initiated "delete PC → leave an NPC behind". Authorises the caller
-- as the PC owner (raises 42501 otherwise), then delegates to the internal
-- migrate-to-NPC helper. (DEL-63)
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
-- 9. REALTIME PUBLICATION
-- ============================================================
-- NotificationsContext subscribes to per-user postgres_changes on
-- `notifications`. The table must be in the supabase_realtime publication
-- to broadcast, and REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry
-- enough columns for the client's reconcile logic. (DEL-78)

alter publication supabase_realtime add table public.notifications;
alter table public.notifications replica identity full;

-- ============================================================
-- 10. FUNCTION EXECUTE GRANTS
-- ============================================================
-- Supabase grants EXECUTE on every new public.* function to PUBLIC (and to
-- anon / authenticated / service_role via default privileges) at creation.
-- The migrations add explicit grants where intent matters and revoke the
-- default PUBLIC/anon grants on functions that should not be anon-callable
-- (DEL-84 / DEL-85). Final intended surface, mirrored from those migrations:

-- Public (unauthenticated) read surface for the magic-link invite screen.
grant execute on function get_invitation_by_token(text) to anon, authenticated;

-- Authenticated-only RPCs (default PUBLIC + anon grants revoked).
revoke execute on function find_user_by_email(text)            from public, anon;
revoke execute on function get_user_handle(uuid)               from public, anon;
revoke execute on function generate_unique_username(text, text) from public, anon;
revoke execute on function claim_invitation_by_token(text)     from public, anon;
revoke execute on function decline_invitation_by_token(text)   from public, anon;
grant execute on function find_user_by_email(text)            to authenticated;
grant execute on function claim_invitation_by_token(text)     to authenticated;
grant execute on function decline_invitation_by_token(text)   to authenticated;

-- The big action RPCs keep Supabase's default grants (PUBLIC/anon retained;
-- bodies no-op for anon by returning a 'gone'/'not_authenticated' sentinel)
-- with an explicit grant to authenticated for clarity.
grant execute on function accept_invitation(uuid)             to authenticated;
grant execute on function accept_invitation_with_pc(uuid, uuid) to authenticated;
grant execute on function leave_campaign(uuid)                to authenticated;
grant execute on function soft_delete_campaign(uuid)          to authenticated;
grant execute on function accept_handler_transfer(uuid)       to authenticated;
grant execute on function delete_pc_to_npc(uuid)              to authenticated;

-- Internal helpers + trigger functions — never callable as RPCs. Execute
-- revoked from every client role; they run as owner from their callers. (DEL-84)
revoke execute on function _migrate_pc_to_npc_internal(uuid)   from public, anon, authenticated;
revoke execute on function _detach_pc_to_npc_internal(uuid)    from public, anon, authenticated;
revoke execute on function handle_campaign_owner_member()      from public, anon, authenticated;
revoke execute on function handle_new_auth_user()              from public, anon, authenticated;
revoke execute on function set_invitation_token()              from public, anon, authenticated;
revoke execute on function demote_pc_on_member_former()        from public, anon, authenticated;
revoke execute on function notify_on_invitation_insert()       from public, anon, authenticated;
revoke execute on function notify_on_invitation_status_change() from public, anon, authenticated;
revoke execute on function notify_on_campaign_soft_delete()    from public, anon, authenticated;
revoke execute on function notify_on_transfer_insert()         from public, anon, authenticated;
revoke execute on function notify_on_transfer_decline()        from public, anon, authenticated;

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
