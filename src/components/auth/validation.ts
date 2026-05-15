/**
 * Client-side validation for the auth screens.
 *
 * Validation here is intentionally light. The server is the authority —
 * Supabase rejects bad credentials, weak passwords, duplicate emails, etc.,
 * and we surface those errors verbatim. Client-side checks exist only to
 * keep the obviously-broken cases (empty field, mismatched confirmation,
 * malformed email) from costing a round-trip.
 *
 * Each validator returns either `null` (valid) or a short user-facing
 * message. Messages are written to fit under a form field in the auth
 * dark-on-green type style — short, no period, sentence case.
 */

import type { AuthError } from '@supabase/supabase-js';

/** Minimum password length. Matches the default Supabase Auth setting. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Loose RFC-5322-ish email check. Deliberately permissive — we don't want
 * to reject valid addresses with quirky local parts. The real check
 * happens server-side; this is just the "did the user forget the @" gate.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Email is required';
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (!confirmation) return 'Confirm your password';
  if (password !== confirmation) return 'Passwords do not match';
  return null;
}

/**
 * Map Supabase's `AuthError` messages onto friendlier copy.
 *
 * Supabase's defaults are mostly fine ("Invalid login credentials") but a
 * couple are bare strings without punctuation, and a couple expose
 * implementation detail ("Email rate limit exceeded"). We rewrite the
 * worst offenders and pass everything else through.
 *
 * When the message is unrecognised we still show it — better to surface
 * the real cause than to swallow it behind a generic "Something went
 * wrong".
 */
export function friendlyAuthError(error: AuthError | null): string | null {
  if (!error) return null;
  const msg = error.message ?? '';

  if (/invalid login credentials/i.test(msg)) {
    return 'Email or password is incorrect.';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Please confirm your email address before signing in.';
  }
  if (/user already registered/i.test(msg)) {
    return 'An account with that email already exists.';
  }
  if (/rate limit/i.test(msg)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (/password should be at least/i.test(msg)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/network|fetch/i.test(msg)) {
    return 'Network error. Check your connection and try again.';
  }

  // Unknown error — pass the raw message through so we don't bury the
  // real cause behind a generic fallback.
  return msg || 'Something went wrong. Try again.';
}
