/**
 * Sign-up screen. Public route at `/signup`.
 *
 * - Email + password + confirm-password fields with inline validation.
 * - Form-level error banner for Supabase failures.
 * - On success: if email confirmation is enabled (Supabase setting), we
 *   show a "check your email" notice. If it's disabled, the new user is
 *   already signed in and we navigate straight into the app.
 *
 * Note: Phase 1 launch concerns include SMTP for Supabase Auth (see
 * the handoff doc). Until that's configured, email-confirmation links
 * arrive from Supabase's default sender — which works but is rate-limited.
 * That's an infra concern, not something this screen worries about.
 */

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

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

export function SignupPage() {
  const { signUp, session, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  if (!loading && session) {
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
    const result = await signUp(email.trim(), password);
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
    // signed in. Drop them into the app.
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

  return (
    <AuthShell
      title="Request Access"
      subtitle="Create a new case file"
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
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          onBlur={() => setEmailError(validateEmail(email))}
          error={emailError}
          placeholder="agent@deltagreen.local"
          disabled={submitting}
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
