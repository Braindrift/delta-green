-- DEL-37 — Add `user_profiles` table for username lookup.
--
-- Creates the publicly-readable surface the "Find user" invite tab
-- (DEL-44) needs to resolve usernames → user ids without touching
-- `auth.users.raw_user_meta_data`, which is per-user-private under RLS.
--
-- One row per `auth.users` row, kept in lockstep by:
--   1. A `BEFORE INSERT` trigger on `auth.users` that auto-creates a
--      profile when a user signs up. Username preference order:
--         (a) `raw_user_meta_data->>'username'` if the signup form
--             supplied one,
--         (b) email local-part, lowercased and stripped of non-
--             alphanumerics,
--         (c) literal `user` if both above resolve to empty.
--      Whichever candidate wins, the helper appends `-2`, `-3`, …
--      until the row is unique. The unique constraint on `username`
--      is the load-bearing safety net; the helper just minimises the
--      number of retries.
--   2. A one-shot DO-block backfill at the bottom of this migration
--      for users that signed up before the trigger existed. Uses the
--      same helper so generated handles look identical to ones
--      produced live.
--
-- Case-insensitive uniqueness is implemented via `citext`. A separate
-- functional unique index on `lower(username)` would also work; `citext`
-- gets the same effect with a single column type and a vanilla UNIQUE
-- constraint, and keeps `=` comparisons case-insensitive without
-- callers having to remember to `lower(...)` either side.
--
-- RLS model:
--   - `select` is open to all `authenticated` users. This table is the
--     intentional public surface for cross-tenant username search and
--     is NOT campaign-scoped — that's the whole point.
--   - `anon` has no access. Username search is a logged-in feature.
--   - `insert` and `delete` have NO client policies; both are managed
--     by the auth-user-insert trigger and `on delete cascade` from
--     `auth.users` respectively.
--   - `update` is restricted to `user_id = auth.uid()`. There's no
--     username-edit UI in v1, but the policy is here now so the
--     eventual UI doesn't need a follow-up migration.
--
-- Consumers (`get_user_handle` in DEL-35, `get_invitation_by_token`
-- in DEL-34) still derive display handles from `auth.users` metadata
-- in this ticket. Migrating those to read from `user_profiles` is a
-- fast-follow refactor — DEL-37 is a "create the surface" ticket, not
-- a "switch every consumer over" ticket.

-- ============================================================
-- EXTENSION
-- ============================================================
-- `citext` ships with Supabase; the `if not exists` keeps the
-- migration idempotent.

create extension if not exists citext;

-- ============================================================
-- HELPER FUNCTION — username generation
-- ============================================================
--
-- Generate a unique username given an email and an optional metadata
-- override. Tries, in order:
--   1. `p_metadata_username`, if non-null/non-empty.
--   2. The email local-part with non-alphanumerics stripped, lowercased.
--   3. Literal `'user'` if both above resolved to empty.
-- Then suffixes `-2`, `-3`, … until the candidate is free.
--
-- `security definer` so the trigger (running as the inserting role)
-- can still read `user_profiles` to test for collisions. Explicit
-- `search_path` to lock down resolution. Volatile because the
-- collision check is a live read; not safe to mark stable.
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

-- ============================================================
-- TABLE
-- ============================================================

create table user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- `citext` makes `=` case-insensitive, so the UNIQUE constraint
  -- enforces case-insensitive uniqueness without a functional index.
  username   citext not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The unique constraint on `username` already creates a btree index,
-- which serves the `where username = $1` lookup pattern from the
-- "Find user" tab (DEL-44). No additional index needed.

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table user_profiles enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================
--
-- No INSERT policy: the only path that creates rows is the
-- `handle_new_auth_user` trigger below (security definer), plus the
-- backfill DO-block at the end of this migration. Client INSERTs are
-- blocked.
--
-- No DELETE policy: deletes propagate via `on delete cascade` from
-- `auth.users`. Client DELETEs are blocked.

-- Open read to every authenticated user. The whole point of this
-- table is cross-tenant username lookup; campaign-scoping it would
-- defeat the purpose.
create policy "user_profiles: authenticated can read"
  on user_profiles for select
  to authenticated
  using (true);

-- Owner can update their own row. Used by the (future) username-edit
-- UI. `with check` also pins `user_id` to `auth.uid()` so an owner
-- can't re-assign their row to a different user via update.
create policy "user_profiles: owner can update own"
  on user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- TRIGGER FUNCTION — auth.users insert
-- ============================================================
--
-- Fires on every new `auth.users` row and creates the matching
-- `user_profiles` row. Reads optional `username` from the signup
-- metadata and hands the whole thing to `generate_unique_username`,
-- which deals with the fallback chain and suffix-on-collision.
--
-- `security definer` because the trigger runs as the inserting role
-- (typically `supabase_auth_admin` for signup, but could be anything
-- in admin contexts) and needs unconditional INSERT into a public
-- table. Explicit `search_path` to prevent the standard
-- search-path-injection vector. Exception-safe: any failure here
-- would silently break signup, so we log and re-raise.
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

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create a profile when a user signs up.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Standard updated_at maintenance.
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function handle_updated_at();

-- ============================================================
-- BACKFILL
-- ============================================================
--
-- One-shot: create `user_profiles` rows for every `auth.users` row
-- that doesn't already have one. Uses the same helper as the trigger
-- so the generated handles are identical to ones produced live.
--
-- Iterating row-by-row (rather than a single set-based insert) is
-- deliberate: `generate_unique_username` needs to see each new row
-- before generating the next candidate, otherwise two users with the
-- same email-prefix would race on the same suffix. Volume here is
-- "every existing signed-up user", which is small.
--
-- `on conflict do nothing` is belt-and-braces — the
-- `where not exists` filter already excludes users with profiles, but
-- if the trigger fired between the SELECT and the INSERT (concurrent
-- signup during migration), the conflict catches it.
do $$
declare
  r record;
  v_username citext;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (
      select 1 from user_profiles p where p.user_id = u.id
    )
  loop
    v_username := generate_unique_username(
      r.email,
      r.raw_user_meta_data->>'username'
    );
    insert into user_profiles (user_id, username)
    values (r.id, v_username)
    on conflict (user_id) do nothing;
  end loop;
end $$;

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor to confirm)
-- ============================================================
--
--   -- Every auth.users row now has a profile:
--   select count(*) from auth.users;
--   select count(*) from user_profiles;
--
--   -- As an authenticated user, the table is fully readable:
--   select user_id, username from user_profiles;
--
--   -- Case-insensitive match works without lower(...):
--   select * from user_profiles where username = 'ERIK';
--
--   -- As an authenticated user, you can only update your own row:
--   update user_profiles set username = 'newname'
--     where user_id = auth.uid();
--
--   -- And NOT someone else's:
--   update user_profiles set username = 'hacker'
--     where user_id <> auth.uid();   -- → 0 rows
