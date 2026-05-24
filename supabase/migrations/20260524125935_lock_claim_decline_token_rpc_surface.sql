-- DEL-85: Make the claim/decline-by-token RPC public surface explicit.
--
-- Decision: both RPCs REQUIRE AUTHENTICATION. The magic-link flow always
-- authenticates the recipient before either RPC is reachable —
-- `claim_invitation_by_token` is only called behind `if (!user) return`
-- in InviteTokenPage, and `decline_invitation_by_token` is only reachable
-- from InviteMismatchScreen, which renders solely in the signed-in branch.
-- Both function bodies also `return` early when `auth.uid()` is null, so
-- anon access was already a dead no-op. There is no signed-out decline
-- path — unauthenticated visitors are redirected to `/signup` first.
--
-- DEL-84 (20260524104112) deferred these two functions because the public
-- surface was ambiguous: the original migration (20260518122637) granted
-- EXECUTE to `authenticated` but never revoked Postgres's default PUBLIC
-- grant, so `anon` retained access. This migration revokes that default
-- grant so the surface is explicit and no longer relies on PUBLIC. The
-- existing `grant ... to authenticated` from 20260518122637 remains the
-- only path in.
--
-- Touches: campaign_invitations (RPC grants only — no schema change)

revoke execute on function public.claim_invitation_by_token(text)
  from public, anon;
revoke execute on function public.decline_invitation_by_token(text)
  from public, anon;
