-- DEL-33 — Add `player_characters` table (schema + RLS).
--
-- Player characters (PCs) are user-owned entities that exist independently of
-- any single campaign. A user has a roster of PCs that persists across
-- campaigns; PCs survive when a campaign ends or the player leaves.
--
-- This is intentionally distinct from the `agent` record type in `records`.
-- `agent` represents in-world Delta Green operatives as GM-authored content
-- inside a specific campaign. `player_characters` represents the actual
-- played-by-a-human PCs the player owns.
--
-- Access model (enforced entirely in RLS):
--   - Owner has full CRUD on their own PCs.
--   - Campaign members (including the Handler / GM) can SELECT PCs that are
--     currently attached to a campaign they're a member of. They CANNOT
--     update or delete — Handler is read-only here. The player has full
--     agency over their character.
--   - The owner's SELECT policy intentionally does NOT filter `deleted_at`,
--     so the owner can see and restore their own soft-deleted PCs (roster
--     trash/restore semantics). The campaign-member SELECT does filter
--     `deleted_at is null` so soft-deleted PCs disappear from a Handler's
--     view immediately.
--   - The owner DELETE policy honours the DoD literally — a real DELETE is
--     allowed in addition to the soft-delete UPDATE path. UI may use either.
--
-- `campaign_id` is nullable: unassigned PCs in a player's roster have no
-- campaign. `on delete set null` means a hard-deleted campaign (rare; soft
-- delete is the default) orphans the PC back to the owner's roster rather
-- than destroying it. Soft-deleting a campaign doesn't touch the PC — the
-- campaign simply becomes unreadable via its own RLS.
--
-- No reverse pointer is added to `campaign_members`. `player_characters.
-- campaign_id` is the source of truth for "which PC is this member playing".

-- ============================================================
-- TABLE
-- ============================================================

create table player_characters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  name        text not null,
  archetype   text,
  data        jsonb not null default '{}',
  status      text not null default 'unassigned',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint player_characters_status_valid check (status in (
    'unassigned',
    'active',
    'retired',
    'deceased',
    'former'
  ))
);

create index player_characters_owner_id_idx    on player_characters(owner_id);
create index player_characters_campaign_id_idx on player_characters(campaign_id);
create index player_characters_deleted_at_idx
  on player_characters(deleted_at)
  where deleted_at is null;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table player_characters enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================

-- Owner: full read on their own PCs, including soft-deleted ones so the
-- owner UI can support a "trash / restore" flow.
create policy "player_characters: owner can read own"
  on player_characters for select
  using (owner_id = auth.uid());

-- Owner: insert their own PCs only. `with check` prevents creating a PC
-- under another user's ownership.
create policy "player_characters: owner can insert own"
  on player_characters for insert
  with check (owner_id = auth.uid());

-- Owner: update their own PCs. The `with check` clause also requires
-- post-update ownership to remain `auth.uid()` — this blocks an owner from
-- transferring ownership of a PC to another user via an update.
create policy "player_characters: owner can update own"
  on player_characters for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Owner: delete their own PCs. Explicit per DoD. Soft-delete (set
-- `deleted_at`) remains available via the update policy; the UI chooses.
create policy "player_characters: owner can delete own"
  on player_characters for delete
  using (owner_id = auth.uid());

-- Campaign members (including the Handler / GM) can read non-deleted PCs
-- attached to a campaign they belong to. Read-only — no update or delete
-- policies exist for non-owners.
create policy "player_characters: campaign members can read attached"
  on player_characters for select
  using (
    campaign_id is not null
    and deleted_at is null
    and is_campaign_member(campaign_id)
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger player_characters_updated_at
  before update on player_characters
  for each row execute function handle_updated_at();
