-- ============================================================
-- Delta Green — Complete Supabase Schema
-- ============================================================
-- Structure (run order matters):
--   1. Generic helper functions (table-independent)
--   2. All tables + indexes
--   3. RLS enable on all tables
--   4. Table-dependent helper functions
--   5. Policies
--   6. Triggers
--
-- This separation avoids forward-reference errors in policies
-- and sql-language functions, which validate referenced relations
-- at creation time.
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

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table campaigns           enable row level security;
alter table campaign_members    enable row level security;
alter table records             enable row level security;
alter table record_visibility   enable row level security;
alter table linked_records      enable row level security;
alter table sessions            enable row level security;

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

create trigger campaign_owner_becomes_gm
  after insert on campaigns
  for each row execute function handle_campaign_owner_member();

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
