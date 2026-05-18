-- DEL-47 — Player leave-campaign RPC.
--
-- Adds the privileged entry point the landing-page "Leave campaign" action
-- needs. The schema columns (`status`, `left_at`) and the PC demote trigger
-- already exist:
--   - `20260517120000_extend_campaign_members_with_status.sql` (DEL-36)
--     added `status` + `left_at` and made `is_campaign_member` /
--     `is_campaign_gm` require `status = 'active'`, so the RLS cut-off is
--     transitive across records, sessions, etc.
--   - `20260518100000_member_kick_pc_demote_and_email_lookup.sql` (DEL-44)
--     added `demote_pc_on_member_former`, which flips the leaving user's
--     attached PC to `status = 'former'` (keeping `campaign_id`) inside the
--     same transaction as the membership status flip.
--
-- The gap this migration closes: only `campaign_members: gm can update`
-- exists today. A player has no path to update their own row. Rather than
-- adding a "player can update own row" RLS policy that would have to be
-- narrowed (only the status column, only active → former, never role) and
-- still couldn't enforce the Handler trap cleanly, we expose a single
-- SECURITY DEFINER RPC. The RPC is the only sanctioned write path for
-- this flow, mirroring the pattern set by `claim_invitation_by_token` /
-- `decline_invitation_by_token` (DEL-45) and
-- `accept_invitation_with_pc` (DEL-46).
--
-- Handler trap: the RPC refuses (returns `'is_handler'` without mutating)
-- if the caller's row has `role = 'gm'`. The single-owner constraint
-- means any Handler row is the sole Handler — there is no scenario where
-- a Handler can leave without first transferring or deleting the
-- campaign. The landing-page UI surfaces this affordance only on
-- `role = 'player'` cards, so the trap is unreachable from the As Agent
-- menu in v1. It exists as a defensive backstop: stale UI state (a
-- post-transfer race) or a future surface that adds the action elsewhere
-- both fall through to the same response, and the UI translates it to
-- `LeaveLastHandlerModal`.
--
-- The PC demote happens transitively via the existing trigger — no
-- extra work here. `security definer` + locked `search_path` follows
-- the same shape as the other RPCs in this codebase.
--
-- Touches: no DDL, function-only.

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

  -- Locking the row prevents a race where a concurrent role transfer
  -- (M-7c / DEL-49) flips the caller from player → gm between the read
  -- and the update.
  select * into caller_row
  from campaign_members
  where campaign_id = p_campaign_id
    and user_id = caller_id
    and status = 'active'
  for update;

  if not found then
    -- No active membership: either never joined, already left/kicked,
    -- or the campaign is soft-deleted. All indistinguishable to the
    -- caller for the same information-leak reason as elsewhere.
    return 'not_member';
  end if;

  if caller_row.role = 'gm' then
    -- Single-owner constraint means any Handler row is the sole Handler.
    -- Refuse without mutating; the UI surfaces LeaveLastHandlerModal.
    return 'is_handler';
  end if;

  update campaign_members
     set status  = 'former',
         left_at = now()
   where id = caller_row.id;
  -- PC demote happens via `campaign_members_demote_pc_on_former`
  -- trigger (DEL-44) inside this same transaction.

  return 'left';
end;
$$;

grant execute on function leave_campaign(uuid) to authenticated;

-- ============================================================
-- VERIFICATION (commented; covered by the DEL-47 smoke tests
-- run via the Supabase MCP)
-- ============================================================
--
--   -- As a player member of campaign X:
--   select leave_campaign('<X>');              -- 'left'
--   select status, left_at from campaign_members
--     where campaign_id = '<X>' and user_id = auth.uid();
--   -- → status = 'former', left_at populated.
--   select status, campaign_id from player_characters
--     where owner_id = auth.uid() and campaign_id = '<X>';
--   -- → status = 'former', campaign_id retained.
--
--   -- As the sole Handler of campaign X:
--   select leave_campaign('<X>');              -- 'is_handler'
--   select status from campaign_members
--     where campaign_id = '<X>' and user_id = auth.uid();
--   -- → status = 'active' (unchanged).
