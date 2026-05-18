-- DEL-45 — Stranger-invite claim + decline RPCs.
--
-- The magic-link flow needs two security-definer entry points beyond
-- DEL-34's `get_invitation_by_token`. Both operate on stranger invites
-- (`invitee_email is not null`) and are keyed by the per-invite token rather
-- than by `invitee_user_id`, because the recipient is either not yet linked
-- (first claim) or linked under a different identity (mismatch decline).
--
-- 1. `claim_invitation_by_token(p_token)` — after signup or login, link the
--    authenticated user to a still-pending invite. RLS's "invitee can
--    update own" can't apply yet (`invitee_user_id` is null until this
--    point), and "gm can update" doesn't apply to the recipient, so a
--    privileged path is required. The function requires `auth.uid()` and a
--    matching lowercased `auth.users.email` against `invitee_email`;
--    callers without both get back an empty result set.
--
--    The claim also nulls out `invitee_email` and `token` so the row's
--    XOR constraint (`campaign_invitations_invitee_xor`) stays satisfied
--    and the row converts cleanly into an existing-user invite. After
--    claim, the recipient's normal "invitee can update own" RLS policy
--    governs the row, and the now-resolved token cannot be replayed.
--
-- 2. `decline_invitation_by_token(p_token)` — the "Decline this invite"
--    recovery action from the mismatch screen. Auth required (defense in
--    depth against token-guessing) but no email match: the wrong-email
--    recipient is allowed to reject without signing out, since they are
--    proving access via the token. Status flip drives DEL-35's
--    invite_declined trigger automatically.
--
-- Both functions only act on `status = 'pending'` rows whose `expires_at`
-- is still in the future. Anything else returns zero rows and the caller
-- falls back into the `InviteGoneScreen` flow by re-fetching the
-- invitation via `get_invitation_by_token`.
--
-- `security definer` + locked `search_path` follows the same pattern as
-- `get_invitation_by_token` (DEL-34) and `find_user_by_email` (DEL-? —
-- `20260518100000_member_kick_pc_demote_and_email_lookup.sql`).
--
-- Touches: campaign_invitations

-- ============================================================
-- claim_invitation_by_token
-- ============================================================

create or replace function claim_invitation_by_token(p_token text)
returns table (
  invitation_id uuid,
  campaign_id   uuid
)
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

grant execute on function claim_invitation_by_token(text) to authenticated;

-- ============================================================
-- decline_invitation_by_token
-- ============================================================

create or replace function decline_invitation_by_token(p_token text)
returns table (
  invitation_id uuid
)
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

grant execute on function decline_invitation_by_token(text) to authenticated;
