import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

type LocationState = { from?: { pathname: string } } | null;

export function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If they're already signed in, send them away from the login page.
  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn(email, password);

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error?.message ?? 'Sign-in failed.');
      return;
    }

    const from = (location.state as LocationState)?.from?.pathname ?? '/';
    navigate(from, { replace: true });
  }

  return (
    <div style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Sign in</h1>

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
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        No account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
}
