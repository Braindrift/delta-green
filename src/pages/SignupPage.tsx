/**
 * Sign-up screen. Public route at `/signup`.
 *
 * - Email + password + confirm-password fields with inline validation.
 * - Form-level error banner for Supabase failures.
 * - On success: if email confirmation is enabled (Supabase setting), we
 *   show a "check your email" notice. If it's disabled, the new user is
 *   already signed in and we navigate straight into the app.
 *
 * Magic-link invite handoff (DEL-45):
 *
 *   - When the URL carries `?invite=<token>`, the page resolves the token
 *     via `getInvitationByToken` and pre-fills the email field with the
 *     invited address. The email field is rendered as readonly so the
 *     recipient can't break the handoff by editing it (changing it would
 *     create an account that the post-signup claim refuses to link).
 *   - `signUp` is called with `emailRedirectTo: /invite/<token>` so the
 *     confirmation link routes back through `InviteTokenPage`, which
 *     runs `claim_invitation_by_token` once the new session lands.
 *   - The token is also persisted via `useEffect` → effect cleanup happens
 *     when the user navigates away, so a half-finished signup leaves no
 *     residue.
 *
 * Note: Phase 1 launch concerns include SMTP for Supabase Auth (see
 * the handoff doc). Until that's configured, email-confirmation links
 * arrive from Supabase's default sender — which works but is rate-limited.
 * That's an infra concern, not something this screen worries about.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthFormField } from '@/components/auth/AuthFormField';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/components/auth/validation';
import { useAuth } from '@/contexts/AuthContext';
import { getInvitationByToken } from '@/lib/invitations';

type InviteContext = {
  token: string;
  email: string;
  campaignName: string;
};

type InviteState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'ready'; invite: InviteContext };

export function SignupPage() {
  const { signUp, session, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [inviteState, setInviteState] = useState<InviteState>(
    inviteToken ? { kind: 'loading' } : { kind: 'idle' },
  );

  // Resolve the invite token (if any) so we can pre-fill the email field.
  // Runs once per token; we deliberately don't react to subsequent URL
  // changes — the signup flow shouldn't switch invites mid-form.
  //
  // setStates are deferred behind a `Promise.resolve()` microtask to
  // satisfy `react-hooks/set-state-in-effect`, same pattern as
  // `CampaignContext.tsx`.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setInviteState({ kind: 'loading' });

      const result = await getInvitationByToken(inviteToken);
      if (cancelled) return;

      if (!result.ok || result.data === null) {
        setInviteState({ kind: 'invalid' });
        return;
      }

      const inv = result.data;
      const expired =
        inv.status === 'pending' && new Date(inv.expires_at).getTime() < Date.now();
      if (inv.status !== 'pending' || expired) {
        setInviteState({ kind: 'invalid' });
        return;
      }

      const invite: InviteContext = {
        token: inviteToken,
        email: inv.invitee_email,
        campaignName: inv.campaign_name,
      };
      setInviteState({ kind: 'ready', invite });
      setEmail(invite.email);
      setEmailError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  if (!loading && session) {
    // If the user is already signed in and arrived with a token, bounce
    // them through /invite/:token so the claim path picks them up.
    if (inviteToken) {
      return <Navigate to={`/invite/${encodeURIComponent(inviteToken)}`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    const cErr = validatePasswordConfirmation(password, confirm);
    setEmailError(eErr);
    setPasswordError(pErr);
    setConfirmError(cErr);
    setFormError(null);
    if (eErr || pErr || cErr) return;

    setSubmitting(true);
    const emailRedirectTo =
      inviteState.kind === 'ready'
        ? `${window.location.origin}/invite/${encodeURIComponent(inviteState.invite.token)}`
        : undefined;
    const result = await signUp(email.trim(), password, { emailRedirectTo });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(friendlyAuthError(result.error));
      return;
    }

    if (result.needsEmailConfirmation) {
      setPendingConfirmation(true);
      return;
    }

    // Email confirmation disabled in Supabase → the new user is already
    // signed in. If they came in via the magic link, route through the
    // /invite handler so the claim RPC runs.
    if (inviteState.kind === 'ready') {
      navigate(`/invite/${encodeURIComponent(inviteState.invite.token)}`, {
        replace: true,
      });
      return;
    }
    navigate('/', { replace: true });
  }

  if (pendingConfirmation) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Pending verification"
        footer={
          <span>
            Already verified?{' '}
            <Link
              to="/login"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Sign in
            </Link>
          </span>
        }
      >
        <AuthAlert variant="notice" title="Transmission Sent">
          A confirmation link has been dispatched to{' '}
          <span className="text-green-accent">{email}</span>. Activate your
          clearance by following the link, then return here to sign in.
        </AuthAlert>
      </AuthShell>
    );
  }

  const isInviteLocked = inviteState.kind === 'ready';

  return (
    <AuthShell
      title={isInviteLocked ? 'Accept Invitation' : 'Request Access'}
      subtitle={isInviteLocked ? 'Finish signup to join' : 'Create a new case file'}
      footer={
        <span>
          Already cleared?{' '}
          <Link
            to="/login"
            className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
          >
            Sign in
          </Link>
        </span>
      }
    >
      {inviteState.kind === 'loading' ? (
        <AuthAlert variant="notice" title="Stand by">
          Resolving invitation…
        </AuthAlert>
      ) : null}

      {inviteState.kind === 'invalid' ? (
        <AuthAlert variant="error" title="Invitation Unavailable">
          The invitation link is invalid or no longer active. You can still
          sign up — or ask the Handler to send a fresh invite.
        </AuthAlert>
      ) : null}

      {inviteState.kind === 'ready' ? (
        <AuthAlert variant="notice" title="Invitation Received">
          You were invited to{' '}
          <span className="text-paper">"{inviteState.invite.campaignName}"</span>.
          Sign up with{' '}
          <span className="text-green-accent">{inviteState.invite.email}</span>{' '}
          to accept.
        </AuthAlert>
      ) : null}

      {formError ? (
        <AuthAlert variant="error" title="Registration Error">
          {formError}
        </AuthAlert>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <AuthFormField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            if (isInviteLocked) return;
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          onBlur={() => {
            if (isInviteLocked) return;
            setEmailError(validateEmail(email));
          }}
          error={emailError}
          hint={
            isInviteLocked
              ? 'Email is fixed by the invitation. Sign out first if you need a different address.'
              : undefined
          }
          placeholder="agent@deltagreen.local"
          disabled={submitting}
          readOnly={isInviteLocked}
        />

        <AuthFormField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
            // If the confirm field has a mismatch error, re-check it as
            // the user fixes the password — saves a redundant tab.
            if (confirmError) {
              setConfirmError(validatePasswordConfirmation(e.target.value, confirm));
            }
          }}
          error={passwordError}
          hint={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
          disabled={submitting}
        />

        <AuthFormField
          label="Confirm Password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (confirmError) setConfirmError(null);
          }}
          onBlur={() => setConfirmError(validatePasswordConfirmation(password, confirm))}
          error={confirmError}
          disabled={submitting}
        />

        <AuthSubmitButton
          label="Create Account"
          loadingLabel="Filing request…"
          loading={submitting}
        />
      </form>
    </AuthShell>
  );
}
