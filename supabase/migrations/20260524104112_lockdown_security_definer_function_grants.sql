-- DEL-84: Lock down anon-callable SECURITY DEFINER functions.
--
-- Postgres grants EXECUTE on every new public.* function to PUBLIC by
-- default. Our migrations grant explicitly to `authenticated` but never
-- first revoke from PUBLIC, so `anon` retained access to every
-- SECURITY DEFINER RPC. This migration revokes those grants.
--
-- The internal `_*` helpers below are called only from other
-- SECURITY DEFINER code (the `delete_pc_to_npc` RPC and the
-- `demote_pc_on_member_former` trigger). Those callers execute as the
-- function owner, so they keep access after these revokes.

-- F1: anonymous PC hijack -----------------------------------------------
revoke execute on function public._migrate_pc_to_npc_internal(uuid)
  from public, anon, authenticated;
revoke execute on function public._detach_pc_to_npc_internal(uuid)
  from public, anon, authenticated;

-- F2: email enumeration -------------------------------------------------
-- The existing `grant execute ... to authenticated` from migration
-- 20260518100000 still applies after this revoke.
revoke execute on function public.find_user_by_email(text) from public, anon;

-- Lower-stakes companions -----------------------------------------------
revoke execute on function public.get_user_handle(uuid) from public, anon;
revoke execute on function public.generate_unique_username(text, text)
  from public, anon;

-- Trigger functions — should never be callable as RPCs ------------------
revoke execute on function public.handle_campaign_owner_member()
  from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated;
revoke execute on function public.set_invitation_token()
  from public, anon, authenticated;
revoke execute on function public.demote_pc_on_member_former()
  from public, anon, authenticated;
revoke execute on function public.notify_on_invitation_insert()
  from public, anon, authenticated;
revoke execute on function public.notify_on_invitation_status_change()
  from public, anon, authenticated;
revoke execute on function public.notify_on_campaign_soft_delete()
  from public, anon, authenticated;
revoke execute on function public.notify_on_transfer_insert()
  from public, anon, authenticated;
revoke execute on function public.notify_on_transfer_decline()
  from public, anon, authenticated;
