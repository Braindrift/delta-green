import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function SignupPage() {
  const { signUp, session, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signUp(email, password);

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error?.message ?? 'Sign-up failed.');
      return;
    }

    if (result.needsEmailConfirmation) {
      setPendingConfirmation(true);
      return;
    }

    // Email confirmation disabled → user is already signed in.
    navigate('/', { replace: true });
  }

  if (pendingConfirmation) {
    return (
      <div style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Check your email</h1>
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Click the link to activate
          your account, then come back and{' '}
          <Link to="/login">sign in</Link>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Sign up</h1>

      <form onSubmit={onSubmit} noValidate>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password">Password (min 6 characters)</label>
          <br />
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {error && (
          <p role="alert" style={{ color: 'crimson' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
