import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { DEFAULT_NAV_PATH } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import {
  AgentsPage,
  ArtifactsPage,
  AssetsPage,
  CiviliansPage,
  EventsAllPage,
  GlobalAffairsPage,
  HeadlinesPage,
  IncidentsPage,
  LocationsPage,
  OperationsActivePage,
  OperationsAllPage,
  OperationsClosedPage,
  OperationsCompromisedPage,
  OrganisationsPage,
  PoiPage,
  UnnaturalPage,
} from '@/pages/sections';
import { SignupPage } from '@/pages/SignupPage';

/**
 * Route table.
 *
 * The `/login` and `/signup` routes are public. Everything else is
 * gated behind `<ProtectedRoute>` and rendered inside the `AppLayout`
 * shell via nested routing — each leaf page is an `<Outlet>` child of
 * the layout.
 *
 * The leaf paths exactly mirror `NAV_GROUPS` in `navConfig.ts`, which is
 * the single source of truth for both sidebar links and routes.
 *
 * `/` redirects to the first nav path (currently `/operations` — all
 * operations). Unknown paths under the protected tree bounce there too.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Default landing — bounce to the first nav leaf. */}
            <Route index element={<Navigate to={DEFAULT_NAV_PATH} replace />} />

            {/* Operations */}
            <Route path="operations" element={<OperationsAllPage />} />
            <Route path="operations/active" element={<OperationsActivePage />} />
            <Route path="operations/closed" element={<OperationsClosedPage />} />
            <Route path="operations/compromised" element={<OperationsCompromisedPage />} />

            {/* Subjects */}
            <Route path="subjects/agents" element={<AgentsPage />} />
            <Route path="subjects/civilians" element={<CiviliansPage />} />
            <Route path="subjects/poi" element={<PoiPage />} />
            <Route path="subjects/unnatural" element={<UnnaturalPage />} />

            {/* Entities */}
            <Route path="entities/organisations" element={<OrganisationsPage />} />
            <Route path="entities/locations" element={<LocationsPage />} />
            <Route path="entities/assets" element={<AssetsPage />} />
            <Route path="entities/artifacts" element={<ArtifactsPage />} />

            {/* Events */}
            <Route path="events" element={<EventsAllPage />} />
            <Route path="events/incidents" element={<IncidentsPage />} />
            <Route path="events/headlines" element={<HeadlinesPage />} />
            <Route path="events/globalaffairs" element={<GlobalAffairsPage />} />

            {/* Any unmatched authenticated path → land on the default. */}
            <Route path="*" element={<Navigate to={DEFAULT_NAV_PATH} replace />} />
          </Route>

          {/* Anything else (unauthenticated unknown path) → root, which
              bounces to /login if no session, or to the default nav. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
