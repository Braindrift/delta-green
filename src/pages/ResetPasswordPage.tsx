/**
 * Password-reset confirmation screen. Public route at
 * `/reset-password/confirm`.
 *
 * Step two of two in the reset flow. The user arrives here from the
 * recovery email link; Supabase auto-creates a `PASSWORD_RECOVERY`
 * session on landing, which is what lets us call `updateUser` to set
 * the new password.
 *
 * - If there's no session at all, the user got here without clicking
 *   the email link. Show a helpful banner pointing them at the request
 *   page rather than a confusing empty form.
 * - On a successful password update, we don't auto-redirect. We show a
 *   confirmation banner with a link to sign-in, so the user has a moment
 *   to register that the change went through. The Supabase recovery
 *   session is technically valid as a normal session after the update,
 *   but routing them through `/login` exercises the new password
 *   immediately and makes the flow obvious.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthFormField } from '@/components/auth/AuthFormField';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { Splash } from '@/components/auth/Splash';
import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  validatePassword,
  validatePasswordConfirmation,
} from '@/components/auth/validation';
import { useAuth } from '@/contexts/AuthContext';

export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Wait for the initial session check before rendering anything — the
  // recovery-link landing fires an auth event milliseconds after mount,
  // and we want the form to render under that hydrated session, not
  // under a transient `null`.
  if (loading) {
    return <Splash />;
  }

  // No session at all means the user didn't follow a recovery link.
  // Direct-typed URL, expired link, third-party cookie blocker — any of
  // these. Point them back to step one.
  if (!session) {
    return (
      <AuthShell
        title="Recovery Link Required"
        subtitle="Session not detected"
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
        <AuthAlert variant="error" title="No Recovery Session">
          To set a new password, request a recovery link and follow it from
          your email. The link expires shortly after dispatch, so a stale
          link won't get you here.
        </AuthAlert>

        <Link
          to="/reset-password"
          className="block w-full text-center font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[11px] text-green-accent border border-green-mid bg-green-accent/[0.06] hover:bg-green-accent/[0.12] hover:border-green-bright transition-all"
        >
          Request New Link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password Updated"
        subtitle="Recovery complete"
        footer={
          <span>
            <Link
              to="/login"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Proceed to sign in
            </Link>
          </span>
        }
      >
        <AuthAlert variant="notice" title="Credentials Refreshed">
          Your password has been updated. Sign in with your new credentials
          to resume operations.
        </AuthAlert>
      </AuthShell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const pErr = validatePassword(password);
    const cErr = validatePasswordConfirmation(password, confirm);
    setPasswordError(pErr);
    setConfirmError(cErr);
    setFormError(null);
    if (pErr || cErr) return;

    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(friendlyAuthError(result.error));
      return;
    }

    setDone(true);
  }

  return (
    <AuthShell
      title="Set New Password"
      subtitle="Complete recovery"
      footer={
        <span>
          Changed your mind?{' '}
          <Link
            to="/login"
            className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
          >
            Sign in instead
          </Link>
        </span>
      }
    >
      {formError ? (
        <AuthAlert variant="error" title="Update Failed">
          {formError}
        </AuthAlert>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <AuthFormField
          label="New Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
            if (confirmError) {
              setConfirmError(validatePasswordConfirmation(e.target.value, confirm));
            }
          }}
          error={passwordError}
          hint={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
          disabled={submitting}
        />

        <AuthFormField
          label="Confirm New Password"
          type="password"
          name="confirm-new-password"
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
          label="Update Password"
          loadingLabel="Updating…"
          loading={submitting}
        />
      </form>
    </AuthShell>
  );
}
