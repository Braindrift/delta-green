-- DEL-77 — Let a pending invitee read the campaign row their invitation
-- points at, so the in-app accept page can resolve it.
--
-- Symptom
-- -------
-- A Handler invites an existing user via the Invite Players modal (DEL-77).
-- The invitee receives the `invite_received` notification, clicks Open, and
-- lands on `/invitations/<id>` — but the page renders "Unknown invitation".
--
-- Cause
-- -----
-- `getInvitationForAccept` (src/lib/invitations/queries.ts) selects from
-- `campaign_invitations` with an `!inner` PostgREST embed against
-- `campaigns`:
--
--     .select('..., campaign:campaigns!inner(id, name, max_agents, deleted_at)')
--     .eq('id', invitationId)
--
-- The invitee CAN read their own invitation row (the
-- `campaign_invitations: invitee can read own` policy admits
-- `invitee_user_id = auth.uid()`), but the `!inner` join then evaluates the
-- `campaigns` SELECT policies against the same caller. After DEL-72 those
-- are:
--
--     using (deleted_at is null and (auth.uid() = owner_id
--                                    or is_campaign_member(id)))
--
-- A pending invitee owns nothing and is not yet a member, so the join
-- yields null, the embed makes the whole row null, and the page falls
-- through to its `not_found` branch.
--
-- This has always been broken for existing-user invites — the
-- magic-link path (DEL-45) bypasses RLS via the
-- `claim_invitation_by_token` security-definer RPC, which is why the
-- regression went unnoticed until DEL-77 made existing-user invites
-- routine.
--
-- Fix
-- ---
-- Add an additive SELECT policy admitting a campaign read when the caller
-- holds a *pending, non-expired* invitation to it. Multiple SELECT
-- policies are OR-ed, so the existing owner/member branches keep working
-- and no current admit path is widened.
--
-- After accept, the user becomes a member and reads the campaign through
-- the existing `members can read` branch — this new policy is needed only
-- for the brief pre-accept window.
--
-- Notes
-- -----
-- * `expires_at > now()` keeps the admit window aligned with what the UI
--   considers actionable; an expired invite resolves to the matching
--   `InviteGoneScreen` variant via `getInvitationForAccept`'s own status
--   check, but only when the page first loads — once accepted the user is
--   a member anyway, so the bound is academic.
-- * `deleted_at is null` is mirrored from the existing policy so a
--   soft-deleted campaign stays hidden from a pending invitee too.
-- * No write policy changes. The campaign remains writable only by its
--   Handler.

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

-- ============================================================
-- VERIFICATION (commented; paste into the SQL editor as the
-- pending invitee user to confirm)
-- ============================================================
--
--   -- As the invitee_user_id of a pending invitation:
--   select id, name
--   from campaigns
--   where id = (
--     select campaign_id from campaign_invitations
--     where invitee_user_id = auth.uid()
--       and status = 'pending'
--       and expires_at > now()
--     limit 1
--   );
--   -- Expected: one row (the campaign you were invited to).
--
--   -- And the embed used by getInvitationForAccept:
--   select i.id, c.id as campaign_id, c.name
--   from campaign_invitations i
--   inner join campaigns c on c.id = i.campaign_id
--   where i.invitee_user_id = auth.uid()
--     and i.status = 'pending';
--   -- Expected: rows resolve, no longer empty.
