/**
 * Sign-in screen. Public route at `/login`.
 *
 * - Email + password fields with inline validation.
 * - Form-level error banner for Supabase auth failures.
 * - Link to signup, link to password reset.
 * - On success, returns to the `location.state.from` path that
 *   `ProtectedRoute` stashed when it bounced an unauthenticated user.
 *   Falls back to `/` (which then redirects to the default nav landing).
 *
 * Already-signed-in users hitting this route are bounced straight to the
 * app — happens when the session hydrates from storage between the route
 * mounting and the user noticing they're on `/login`.
 */

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthFormField } from '@/components/auth/AuthFormField';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import {
  friendlyAuthError,
  validateEmail,
  validatePassword,
} from '@/components/auth/validation';
import { useAuth } from '@/contexts/AuthContext';

type LocationState = { from?: { pathname: string } } | null;

export function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Bounce. This handles the case where the auth
  // state hydrates from storage between the route mounting and the user
  // noticing they're on /login.
  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Run client-side validation first. The server is authoritative on
    // credentials, but we don't need a round-trip to tell the user their
    // password field is empty.
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    if (eErr || pErr) return;

    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(friendlyAuthError(result.error));
      return;
    }

    const from = (location.state as LocationState)?.from?.pathname ?? '/';
    navigate(from, { replace: true });
  }

  return (
    <AuthShell
      title="Authenticate"
      subtitle="Sign in to your case file"
      footer={
        <div className="flex flex-col gap-2">
          <span>
            No clearance on file?{' '}
            <Link
              to="/signup"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Request access
            </Link>
          </span>
          <span>
            Lost your password?{' '}
            <Link
              to="/reset-password"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Begin recovery
            </Link>
          </span>
        </div>
      }
    >
      {formError ? (
        <AuthAlert variant="error" title="Authentication Error">
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError(null);
          }}
          error={passwordError}
          disabled={submitting}
        />

        <AuthSubmitButton
          label="Sign In"
          loadingLabel="Authenticating…"
          loading={submitting}
        />
      </form>
    </AuthShell>
  );
}
