/**
 * Recovery screen for the "logged in, but with a different email than the
 * invite was sent to" branch of the magic-link landing.
 *
 * Two recovery options:
 *
 *   - **Sign out and continue** — terminates the current session and
 *     redirects the recipient back to `/invite/:token`. From there the
 *     not-logged-in branch kicks in, which routes to `/signup?invite=...`
 *     pre-filled with the invited email. The recipient ends up with the
 *     correct account.
 *   - **Decline this invite** — politely rejects without touching the
 *     session. Calls `decline_invitation_by_token` (DEL-45 RPC) so the
 *     Handler is notified.
 *
 * The "best UX" question in the DoD: we ship both options. Sign-out + the
 * signup loop is the cheap-recovery path; decline is the explicit-no path.
 * No "ask the Handler to re-invite" copy — the Handler can already see the
 * decline outcome via DEL-35's notification triggers.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { declineInvitationByToken } from '@/lib/invitations';

export type InviteMismatchScreenProps = {
  token: string;
  /** The email the invite was sent to. */
  invitedEmail: string;
  /** The currently-signed-in user's email. */
  signedInEmail: string | null;
  /** Campaign name for warmer copy. */
  campaignName: string;
  /** Called when the recipient declines — parent re-fetches the row so
   *  the InviteGoneScreen kicks in. */
  onDeclined: () => void;
};

export function InviteMismatchScreen({
  token,
  invitedEmail,
  signedInEmail,
  campaignName,
  onDeclined,
}: InviteMismatchScreenProps) {
  const { signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [busy, setBusy] = useState<'signing-out' | 'declining' | null>(null);

  async function handleSignOut() {
    if (busy) return;
    setBusy('signing-out');
    const result = await signOut();
    setBusy(null);

    if (!result.ok) {
      showToast('error', 'Could not sign out. Try again.');
      return;
    }
    // Bounce through the same /invite route — the not-logged-in branch
    // takes over and shuttles to /signup with the invited email pre-filled.
    navigate(`/invite/${encodeURIComponent(token)}`, { replace: true });
  }

  async function handleDecline() {
    if (busy) return;
    setBusy('declining');
    const result = await declineInvitationByToken(token);
    setBusy(null);

    if (!result.ok) {
      showToast('error', 'Could not decline the invitation. Try again.');
      return;
    }
    showToast('success', 'Invitation declined.');
    onDeclined();
  }

  return (
    <AuthShell
      title="Different email on file"
      subtitle="This invitation was sent to another address"
    >
      <AuthAlert variant="notice" title="Email Mismatch">
        The invitation to <span className="text-paper">"{campaignName}"</span>{' '}
        was addressed to{' '}
        <span className="text-green-accent">{invitedEmail}</span>, but you are
        signed in as{' '}
        <span className="text-paper">
          {signedInEmail ?? 'a different account'}
        </span>
        .
      </AuthAlert>

      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
        To accept, sign out and either sign in or sign up with{' '}
        <span className="text-paper">{invitedEmail}</span>. Or decline now if
        the invite isn't meant for you.
      </p>

      <div className="flex justify-end gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleDecline}
          disabled={busy !== null}
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
            'text-paper-worn border border-green-dim/60 bg-transparent',
            'transition-colors duration-150',
            'hover:text-red-stamp hover:border-red-faded',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {busy === 'declining' ? 'Declining…' : 'Decline this invite'}
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy !== null}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {busy === 'signing-out' ? 'Signing out…' : 'Sign out and continue'}
        </button>
      </div>
    </AuthShell>
  );
}
