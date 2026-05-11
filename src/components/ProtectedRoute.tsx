import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Wraps any route that requires an authenticated user.
 *
 * - While the initial session check is in flight, renders nothing (avoids the
 *   "logged-in user briefly bounced to /login on refresh" flicker).
 * - On no session, redirects to /login and stashes the original destination
 *   in `location.state.from` so we can return there after sign-in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Intentionally blank. Replace with a proper splash component when DEL-15
    // (app shell) lands and we have a designed loading state.
    return null;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
