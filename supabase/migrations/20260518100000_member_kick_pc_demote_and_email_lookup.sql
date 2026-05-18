-- DEL-44 — Member kick: PC demote trigger + email-lookup RPC.
--
-- Two changes the Members screen + Handler-kick flow depend on:
--
--   1. A trigger that flips a kicked / left member's attached player
--      character (PC) to `status = 'former'` while keeping its
--      `campaign_id`. Without this the Handler can't demote the PC
--      directly — `player_characters.owner can update own` is the only
--      update policy on that table, so a Handler kicking another
--      player has no path to write the PC. A `security definer`
--      trigger on `campaign_members` bridges the gap and also benefits
--      the player-leave flow (M-7a / DEL-47) without further work.
--
--   2. A `find_user_by_email` security-definer RPC that returns the
--      `auth.users.id` for an email, or null. The "By email" tab in
--      this ticket resolves emails only against existing users; the
--      stranger-invite flow (M-5 / DEL-45) replaces the "user not
--      found" inline error with a real magic-link issuance. Restricted
--      to `authenticated` — anon doesn't get to probe whether an email
--      is registered.
--
-- Both functions use `security definer` + explicit `search_path` to
-- run with the function owner's privileges and resolve table names
-- from the locked-down path (standard search-path-injection guard).

-- ============================================================
-- TRIGGER FUNCTION — demote PC when member becomes former
-- ============================================================
--
-- Fires after a `campaign_members` row transitions from `active` to
-- `former`. Updates the kicked / left user's attached PC (matching by
-- `owner_id = NEW.user_id and campaign_id = NEW.campaign_id`) to
-- `status = 'former'`, leaving `campaign_id` populated so the historical
-- attachment survives. Only touches rows whose status was `active` or
-- `unassigned` — `retired` / `deceased` / `former` stay as-is so
-- player-set narrative state isn't overwritten by a membership flip.
--
-- A user can only have one PC per campaign in practice (no schema
-- constraint enforces this today; the rule is product-level), so the
-- update typically touches 0–1 rows. Still expressed as a set update
-- so the trigger remains correct if the rule ever loosens.

create or replace function demote_pc_on_member_former()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Only fire on the active → former transition. Other status flips
  -- (none today; the check constraint allows only active/former) and
  -- updates that don't touch status are no-ops here.
  if new.status = 'former' and old.status = 'active' then
    update player_characters
       set status = 'former'
     where owner_id   = new.user_id
       and campaign_id = new.campaign_id
       and status      in ('active', 'unassigned');
  end if;

  return new;
end;
$$;

create trigger campaign_members_demote_pc_on_former
  after update of status on campaign_members
  for each row execute function demote_pc_on_member_former();

-- ============================================================
-- RPC — find_user_by_email
-- ============================================================
--
-- Returns the `auth.users.id` whose email matches `p_email` (case-
-- insensitive), or null when no row matches. Backs the "By email" tab
-- in the invite modal (DEL-44).
--
-- `auth.users` is per-user-private under default Supabase RLS — direct
-- selects from `authenticated` return only the caller's own row. The
-- function pierces that with `security definer` so the Handler can
-- resolve any existing user's id for invite purposes.
--
-- Privacy trade-off: this leaks "is email X registered" to any
-- authenticated user. The mitigation is twofold:
--   - Only `authenticated` can call it (no anon enumeration).
--   - The function returns only the id, never the full row.
-- Rate-limiting is out of scope for v1; revisit if abuse shows up.
--
-- `stable` because the result depends only on table state, not on the
-- transaction's snapshot semantics; safe to be cached within a
-- statement.

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

grant execute on function find_user_by_email(text) to authenticated;

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor to confirm)
-- ============================================================
--
--   -- As any authenticated user, looking up an email returns the
--   -- right id (or null for unknown):
--   select find_user_by_email('sjoblom.erik@gmail.com');
--   select find_user_by_email('nobody@nowhere.example');
--
--   -- Kick path: with an active member who owns an active PC in the
--   -- same campaign, flipping the member to `former` should demote
--   -- the PC to `former` while keeping `campaign_id`:
--
--   update campaign_members
--     set status = 'former', left_at = now()
--     where id = '<member-row-id>';
--
--   select status, campaign_id from player_characters
--     where owner_id = '<the-member-user-id>'
--       and campaign_id = '<the-campaign-id>';
--   -- → status = 'former', campaign_id retained.
