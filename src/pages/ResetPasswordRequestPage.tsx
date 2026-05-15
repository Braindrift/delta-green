/**
 * Password-reset request screen. Public route at `/reset-password`.
 *
 * Step one of two in the reset flow:
 *
 *   1. User enters their email here. We call Supabase, which emails them
 *      a one-time link.
 *   2. Clicking the link in their inbox lands them at
 *      `/reset-password/confirm` (see `ResetPasswordPage`) with a
 *      `PASSWORD_RECOVERY` session, where they set the new password.
 *
 * Privacy note: to avoid leaking which addresses have accounts, the
 * success notice always shows the same "if an account exists" wording
 * regardless of whether the email actually matched anything. Supabase
 * doesn't return that information anyway — `resetPasswordForEmail`
 * resolves the same way for known and unknown emails — so we're just
 * being consistent with that.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthFormField } from '@/components/auth/AuthFormField';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton';
import { friendlyAuthError, validateEmail } from '@/components/auth/validation';
import { useAuth } from '@/contexts/AuthContext';

export function ResetPasswordRequestPage() {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const eErr = validateEmail(email);
    setEmailError(eErr);
    setFormError(null);
    if (eErr) return;

    setSubmitting(true);
    const result = await requestPasswordReset(email.trim());
    setSubmitting(false);

    if (!result.ok) {
      // The only realistic failures here are rate-limit and network
      // errors. Address-not-found is handled silently by Supabase to
      // avoid disclosing account existence.
      setFormError(friendlyAuthError(result.error));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Recovery Initiated"
        subtitle="Awaiting confirmation"
        footer={
          <span>
            Remembered your password?{' '}
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
          If an account exists for{' '}
          <span className="text-green-accent">{email}</span>, a recovery link
          has been dispatched. Follow the link in your inbox to set a new
          password.
        </AuthAlert>
        <p className="font-ui text-[10px] tracking-[0.1em] text-paper-dark/70 leading-relaxed">
          The link is single-use and expires shortly. If it doesn't arrive,
          check your spam folder before requesting another.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recover Access"
      subtitle="Begin password recovery"
      footer={
        <div className="flex flex-col gap-2">
          <span>
            Remembered your password?{' '}
            <Link
              to="/login"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Sign in
            </Link>
          </span>
          <span>
            No account yet?{' '}
            <Link
              to="/signup"
              className="text-green-accent uppercase tracking-[0.16em] hover:text-green-glow transition-colors"
            >
              Request access
            </Link>
          </span>
        </div>
      }
    >
      {formError ? (
        <AuthAlert variant="error" title="Recovery Error">
          {formError}
        </AuthAlert>
      ) : null}

      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        Enter the email address attached to your case file. If it matches an
        existing record we'll dispatch a single-use recovery link.
      </p>

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

        <AuthSubmitButton
          label="Send Recovery Link"
          loadingLabel="Dispatching…"
          loading={submitting}
        />
      </form>
    </AuthShell>
  );
}
