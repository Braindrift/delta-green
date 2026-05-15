import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Splash } from '@/components/auth/Splash';

/**
 * Wraps any route that requires an authenticated user.
 *
 * - While the initial session check is in flight, renders the `Splash`
 *   component — the "ESTABLISHING SECURE CONNECTION" placeholder — to
 *   avoid the "logged-in user briefly bounced to /login on refresh"
 *   flicker without flashing a blank screen at them.
 * - On no session, redirects to /login and stashes the original destination
 *   in `location.state.from` so we can return there after sign-in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Splash />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
