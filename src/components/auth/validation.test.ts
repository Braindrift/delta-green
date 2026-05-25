/**
 * Unit tests for the auth-screen validators (`validation.ts`).
 *
 * Pure functions, no Supabase dependency — the cheapest coverage win called
 * out in the DEL-99 review note (§N3). `friendlyAuthError` is fed minimal
 * objects shaped like `AuthError` (only `message` is read) via a cast.
 */

import { describe, expect, it } from 'vitest';
import type { AuthError } from '@supabase/supabase-js';

import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthError,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from './validation';

/** Shape just enough of an AuthError for `friendlyAuthError` to read `.message`. */
function authError(message: string): AuthError {
  return { message } as AuthError;
}

describe('validateEmail', () => {
  it('rejects an empty value', () => {
    expect(validateEmail('')).toBe('Email is required');
    expect(validateEmail('   ')).toBe('Email is required');
  });

  it('rejects a malformed address', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address');
    expect(validateEmail('missing@domain')).toBe('Enter a valid email address');
  });

  it('accepts a well-formed address (trimmed)', () => {
    expect(validateEmail('agent@delta.green')).toBeNull();
    expect(validateEmail('  agent@delta.green  ')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects an empty value', () => {
    expect(validatePassword('')).toBe('Password is required');
  });

  it('rejects a value below the minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  });

  it('accepts a value at or above the minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('validatePasswordConfirmation', () => {
  it('rejects an empty confirmation', () => {
    expect(validatePasswordConfirmation('secret123', '')).toBe('Confirm your password');
  });

  it('rejects a mismatch', () => {
    expect(validatePasswordConfirmation('secret123', 'secret124')).toBe('Passwords do not match');
  });

  it('accepts a match', () => {
    expect(validatePasswordConfirmation('secret123', 'secret123')).toBeNull();
  });
});

describe('friendlyAuthError', () => {
  it('returns null for no error', () => {
    expect(friendlyAuthError(null)).toBeNull();
  });

  it('rewrites known messages', () => {
    expect(friendlyAuthError(authError('Invalid login credentials'))).toBe(
      'Email or password is incorrect.',
    );
    expect(friendlyAuthError(authError('Email not confirmed'))).toBe(
      'Please confirm your email address before signing in.',
    );
    expect(friendlyAuthError(authError('User already registered'))).toBe(
      'An account with that email already exists.',
    );
    expect(friendlyAuthError(authError('Email rate limit exceeded'))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
    expect(friendlyAuthError(authError('Failed to fetch'))).toBe(
      'Network error. Check your connection and try again.',
    );
  });

  it('passes an unrecognised message through verbatim', () => {
    expect(friendlyAuthError(authError('Some novel server error'))).toBe(
      'Some novel server error',
    );
  });

  it('falls back to a generic message when the message is empty', () => {
    expect(friendlyAuthError(authError(''))).toBe('Something went wrong. Try again.');
  });
});
