-- DEL-48 — Handler campaign soft-delete RPC.
--
-- A direct `update campaigns set deleted_at = now()` from the client is
-- blocked by RLS even for the Handler. PostgreSQL enforces SELECT-policy
-- visibility on the post-image of every UPDATE: the
-- `campaigns: members can read` policy requires `deleted_at is null`, so
-- the post-image (with `deleted_at` populated) fails that check and the
-- statement aborts with `42501 — new row violates row-level security
-- policy for table "campaigns"`. The `campaigns: gm can update` policy's
-- `using` clause passes fine — that's not the trap. The trap is the
-- "post-image must still be visible" rule.
--
-- Options considered:
--
--   1. Widen the SELECT policy so Handlers can read their own soft-deleted
--      campaigns. Would unblock the UPDATE but leak soft-deleted rows back
--      into every `listMyMemberships`-style read (every site that does
--      not explicitly filter `deleted_at is null` would now show them).
--   2. Add a permissive SELECT policy keyed on `is_campaign_gm(id)` with a
--      `deleted_at is not null` qualifier. Workable, but introduces a
--      second read surface for soft-deleted rows that nothing currently
--      reads — dead code with security surface area.
--   3. Route the write through a `security definer` RPC. Mirrors the
--      pattern already established by `leave_campaign` (DEL-47),
--      `claim_invitation_by_token` / `decline_invitation_by_token` (DEL-45),
--      and `accept_invitation_with_pc` (DEL-46). Keeps RLS as the source of
--      truth for reads; the RPC is the single sanctioned write path.
--
-- This migration takes option 3.
--
-- ## Authorisation
--
-- The RPC re-implements the Handler check inline rather than calling
-- `is_campaign_gm()`. Reason: `is_campaign_gm` returns a single bool, but
-- we need to distinguish "no membership" (`not_member`) from "active
-- player member" (`not_handler`) so the UI can render the right error. A
-- direct `select ... for update` against `campaign_members` returns the
-- row, the role, and locks it in one step.
--
-- Same `for update` lock as `leave_campaign`: prevents a race where a
-- concurrent role transfer (M-7c / DEL-49) demotes the caller between the
-- read and the soft-delete.
--
-- The campaign row itself is updated via a plain `update` statement
-- *inside the security-definer function*, which bypasses RLS. The DEL-35
-- `campaigns_notify_soft_delete` trigger fires inside the same transaction
-- and fans out `campaign_deleted` notifications to every active member
-- except the caller (the trigger reads `auth.uid()`, which resolves to the
-- JWT-bound user even inside this function).
--
-- ## Return contract
--
-- Returns a discriminator string the client translates to a `Result<T>`:
--   - `not_authenticated` — no `auth.uid()`.
--   - `not_member`        — no active membership (RLS-hidden, never joined,
--                           already soft-left, campaign already deleted).
--   - `not_handler`       — caller is an active player member, not the
--                           Handler. The Settings page is only reachable to
--                           Handlers (`ManageGuard`), so the realistic path
--                           is the landing-card kebab on a stale UI state.
--   - `deleted`           — soft-delete succeeded.
--
-- Touches: no DDL, function-only.

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
  -- (M-7c / DEL-49) flipping us between the read and the update.
  select role into caller_role
  from campaign_members
  where campaign_id = p_campaign_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    -- No active membership: either never joined, already left/kicked, or
    -- the campaign was soft-deleted in a concurrent transaction.
    -- Indistinguishable to the caller for the same information-leak reason
    -- as `getCampaignById` / `leave_campaign`.
    return 'not_member';
  end if;

  if caller_role <> 'gm' then
    -- Active player member. Refuse without mutating; UI shouldn't reach
    -- this branch under normal navigation (ManageGuard gates the Settings
    -- page; the landing-card kebab only renders on Handler cards) but a
    -- stale UI state could try.
    return 'not_handler';
  end if;

  -- Defensive idempotency check. If two Handler clients race to delete
  -- (only possible during a transfer-ownership corner-case where two
  -- Handlers briefly coexist), the second caller gets `'deleted'` back
  -- without re-firing the notification trigger. The trigger guards on
  -- `old.deleted_at is null AND new.deleted_at is not null`, so a no-op
  -- update would skip the fan-out anyway — this just makes the early
  -- return obvious.
  update campaigns
     set deleted_at = now()
   where id = p_campaign_id
     and deleted_at is null;

  return 'deleted';
end;
$$;

grant execute on function soft_delete_campaign(uuid) to authenticated;

-- ============================================================
-- VERIFICATION (commented; covered by DEL-48 smoke tests
-- run via the Supabase MCP)
-- ============================================================
--
--   -- As the Handler of campaign X:
--   select soft_delete_campaign('<X>');         -- 'deleted'
--   select deleted_at from campaigns where id = '<X>';
--   -- → deleted_at populated.
--   select count(*) from notifications
--     where kind = 'campaign_deleted'
--       and (payload->>'campaign_id') = '<X>'
--       and user_id <> auth.uid();
--   -- → one row per other active member.
--
--   -- As an active player member of campaign X:
--   select soft_delete_campaign('<X>');         -- 'not_handler'
--   select deleted_at from campaigns where id = '<X>';
--   -- → still null (and the campaign is still readable through RLS).
--
--   -- As a non-member:
--   select soft_delete_campaign('<X>');         -- 'not_member'
