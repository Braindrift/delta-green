/**
 * Magic-link landing page for stranger campaign invitations (DEL-45).
 *
 * Public route at `/invite/:token`. Handles four entry states:
 *
 *   1. Invitation is not pending OR expired → render `InviteGoneScreen`
 *      in the matching variant (revoked / accepted / declined / expired).
 *   2. User is not signed in → redirect to `/signup?invite=<token>` where
 *      the email is pre-filled. Once they sign up and confirm, Supabase's
 *      email-confirmation link sends them back through this same route
 *      (via `emailRedirectTo`), at which point branch (3) or (4) applies.
 *   3. User is signed in AND their auth email matches the invitee_email
 *      → call `claim_invitation_by_token` to link the row, then navigate
 *      to the placeholder accept screen at `/invitations/:id`. DEL-46
 *      will replace the placeholder with the real PC-picker flow.
 *   4. User is signed in BUT the email doesn't match → render the
 *      mismatch screen with "sign out + continue" / "decline" recovery
 *      options.
 *
 * The route does NOT require auth. `getInvitationByToken` is a public
 * security-definer RPC that returns only the fields the landing page
 * needs.
 */

import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthShell } from '@/components/auth/AuthShell';
import { InviteGoneScreen, type InviteGoneVariant } from '@/components/invite/InviteGoneScreen';
import { InviteMismatchScreen } from '@/components/invite/InviteMismatchScreen';
import { useAuth } from '@/contexts/AuthContext';
import {
  claimInvitationByToken,
  getInvitationByToken,
} from '@/lib/invitations';
import type { InvitationByToken } from '@/types/members';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'gone'; variant: InviteGoneVariant; campaignName: string }
  | { kind: 'pending'; invitation: InvitationByToken }
  | { kind: 'claiming'; invitation: InvitationByToken }
  | { kind: 'claimed'; invitationId: string };

export function InviteTokenPage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadTick, setReloadTick] = useState(0);
  const claimAttemptedRef = useRef(false);

  // Fetch / re-fetch the invitation. Bumping `reloadTick` re-runs the
  // effect — used by the mismatch decline flow to pick up the new status
  // and route into the matching `InviteGoneScreen`.
  //
  // The setStates are deferred behind a `Promise.resolve()` microtask so
  // they don't fire synchronously inside the effect body — same pattern
  // as `CampaignContext.tsx` to satisfy `react-hooks/set-state-in-effect`.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    claimAttemptedRef.current = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setState({ kind: 'loading' });

      const result = await getInvitationByToken(token);
      if (cancelled) return;

      if (!result.ok) {
        setState({ kind: 'error' });
        return;
      }
      if (result.data === null) {
        setState({ kind: 'not_found' });
        return;
      }

      const inv = result.data;
      const now = Date.now();
      const expiresMs = new Date(inv.expires_at).getTime();
      const isExpired =
        inv.status === 'pending' && Number.isFinite(expiresMs) && expiresMs < now;

      if (isExpired) {
        setState({ kind: 'gone', variant: 'expired', campaignName: inv.campaign_name });
        return;
      }
      if (inv.status !== 'pending') {
        // The four `InviteGoneScreen` variants line up 1:1 with these
        // statuses; the type assertion is safe.
        setState({
          kind: 'gone',
          variant: inv.status as InviteGoneVariant,
          campaignName: inv.campaign_name,
        });
        return;
      }
      setState({ kind: 'pending', invitation: inv });
    })();

    return () => {
      cancelled = true;
    };
  }, [token, reloadTick]);

  // Once the invitation resolves AND the user is signed in AND their email
  // matches, claim the invite. The ref guards against React strict-mode
  // double-fire issuing two RPC calls in a row — the second would be a
  // harmless no-op but it's cleaner to skip.
  useEffect(() => {
    if (state.kind !== 'pending') return;
    if (authLoading) return;
    if (!user) return;
    if (claimAttemptedRef.current) return;

    const signedInEmail = (user.email ?? '').toLowerCase();
    const invitedEmail = state.invitation.invitee_email.toLowerCase();
    if (signedInEmail !== invitedEmail) return;

    claimAttemptedRef.current = true;
    const pendingInvitation = state.invitation;

    void (async () => {
      await Promise.resolve();
      setState({ kind: 'claiming', invitation: pendingInvitation });

      const claim = await claimInvitationByToken(token!);
      if (!claim.ok) {
        // RPC error — fall back to error state. Re-renders the alert below.
        setState({ kind: 'error' });
        return;
      }
      if (claim.data === null) {
        // Race: status flipped between the load and the claim. Re-fetch to
        // pick the right `InviteGoneScreen` variant.
        const refetch = await getInvitationByToken(token!);
        if (!refetch.ok || refetch.data === null) {
          setState({ kind: 'not_found' });
          return;
        }
        const inv = refetch.data;
        if (inv.status === 'pending') {
          // Still pending but RPC refused — most likely the user's email
          // changed mid-flow. Render the mismatch path.
          setState({ kind: 'pending', invitation: inv });
          return;
        }
        setState({
          kind: 'gone',
          variant: inv.status as InviteGoneVariant,
          campaignName: inv.campaign_name,
        });
        return;
      }
      setState({ kind: 'claimed', invitationId: claim.data.invitation_id });
    })();
  }, [state, user, authLoading, token]);

  // After claim, route to the placeholder accept screen. Done via effect
  // so the navigate happens after render, not during.
  useEffect(() => {
    if (state.kind !== 'claimed') return;
    navigate(`/invitations/${state.invitationId}`, { replace: true });
  }, [state, navigate]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (state.kind === 'loading' || state.kind === 'claiming' || authLoading) {
    return (
      <AuthShell title="Decrypting" subtitle="Resolving invitation">
        <AuthAlert variant="notice" title="Stand by">
          Verifying the invitation token…
        </AuthAlert>
      </AuthShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <AuthShell title="Transmission failed" subtitle="Could not resolve invitation">
        <AuthAlert variant="error" title="Resolution Error">
          Something went wrong while looking up this invitation. Reload the
          page or contact the Handler if the problem persists.
        </AuthAlert>
      </AuthShell>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <AuthShell title="Unknown invitation" subtitle="This link is not recognised">
        <AuthAlert variant="error" title="Invalid Token">
          The invitation link is not recognised. It may have been mistyped or
          the row may have been deleted.
        </AuthAlert>
      </AuthShell>
    );
  }

  if (state.kind === 'gone') {
    return <InviteGoneScreen variant={state.variant} campaignName={state.campaignName} />;
  }

  if (state.kind === 'claimed') {
    // Navigation effect above runs next tick — render the loading shell
    // in the meantime so the recipient doesn't see a flash of nothing.
    return (
      <AuthShell title="Linked" subtitle="Routing to invitation">
        <AuthAlert variant="notice" title="Stand by">
          Invitation linked. Loading the accept screen…
        </AuthAlert>
      </AuthShell>
    );
  }

  // state.kind === 'pending'
  if (!user) {
    // Not signed in — hand off to signup with the token. SignupPage reads
    // `?invite=` and pre-fills the email.
    return (
      <Navigate
        to={`/signup?invite=${encodeURIComponent(token)}`}
        replace
      />
    );
  }

  // Signed in with the wrong email — mismatch recovery.
  return (
    <InviteMismatchScreen
      token={token}
      invitedEmail={state.invitation.invitee_email}
      signedInEmail={user.email ?? null}
      campaignName={state.invitation.campaign_name}
      onDeclined={() => {
        // Re-fetch so the right InviteGoneScreen variant takes over.
        setReloadTick((t) => t + 1);
      }}
    />
  );
}
