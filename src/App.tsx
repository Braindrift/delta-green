import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { DEFAULT_NAV_SEGMENT } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { CampaignsIndexPage } from '@/pages/CampaignsIndexPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { ResetPasswordRequestPage } from '@/pages/ResetPasswordRequestPage';
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
 * Auth screens are public. Authenticated routes split into two protected
 * subtrees:
 *
 *   `/campaigns`            — workspace landing (placeholder until R-3).
 *                             Auto-redirects to the user's first campaign.
 *   `/campaigns/:campaignId` — campaign shell. `AppLayout` mounts
 *                              `CampaignProvider` + `CampaignGuard` so every
 *                              descendant has a guaranteed non-null campaign.
 *
 * `/` always redirects to `/campaigns`, which handles auth and the
 * first-campaign redirect in one hop.
 *
 * The leaf paths mirror `NAV_GROUPS` in `navConfig.ts`, which is the single
 * source of truth for sidebar links and the route table.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordRequestPage />} />
          <Route path="/reset-password/confirm" element={<ResetPasswordPage />} />

          {/* Workspace landing — placeholder until R-3 */}
          <Route
            path="/campaigns"
            element={
              <ProtectedRoute>
                <CampaignsIndexPage />
              </ProtectedRoute>
            }
          />

          {/* Campaign shell */}
          <Route
            path="/campaigns/:campaignId"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            {/* Default: bounce to the first nav leaf. */}
            <Route index element={<Navigate to={DEFAULT_NAV_SEGMENT} replace />} />

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

            {/* Unknown campaign-scoped path → default leaf. */}
            <Route path="*" element={<Navigate to={DEFAULT_NAV_SEGMENT} replace />} />
          </Route>

          {/* Root → workspace landing (which bounces to first campaign). */}
          <Route index element={<Navigate to="/campaigns" replace />} />

          {/* Any other path → root. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
