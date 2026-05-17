import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { DEFAULT_NAV_SEGMENT } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
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
import { CampaignsLandingPage } from '@/pages/workspace/CampaignsLandingPage';
import { WorkspaceAgentsPage } from '@/pages/workspace/WorkspaceAgentsPage';
import { WorkspaceNotificationsPage } from '@/pages/workspace/WorkspaceNotificationsPage';
import { WorkspaceBrowsePage } from '@/pages/workspace/WorkspaceBrowsePage';
import { WorkspaceProfilePage } from '@/pages/workspace/WorkspaceProfilePage';
import { WorkspaceAccountPage } from '@/pages/workspace/WorkspaceAccountPage';
import { WorkspacePreferencesPage } from '@/pages/workspace/WorkspacePreferencesPage';

/**
 * Route table.
 *
 * Auth screens are public. Authenticated routes split into two protected
 * subtrees:
 *
 *   Workspace shell  — `/`, `/agents`, `/notifications`, `/browse`, and
 *                      account stubs. `WorkspaceLayout` renders the shared
 *                      header + workspace sidebar.
 *
 *   Campaign shell   — `/campaigns/:campaignId/*`. `AppLayout` mounts
 *                      `CampaignProvider` + `CampaignGuard` so every
 *                      descendant has a guaranteed non-null campaign.
 *
 * The leaf paths in the campaign shell mirror `NAV_GROUPS` in `navConfig.ts`,
 * the single source of truth for sidebar links.
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

          {/* Workspace shell */}
          <Route
            element={
              <ProtectedRoute>
                <WorkspaceLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CampaignsLandingPage />} />
            <Route path="agents" element={<WorkspaceAgentsPage />} />
            <Route path="notifications" element={<WorkspaceNotificationsPage />} />
            <Route path="browse" element={<WorkspaceBrowsePage />} />
            <Route path="profile" element={<WorkspaceProfilePage />} />
            <Route path="account" element={<WorkspaceAccountPage />} />
            <Route path="preferences" element={<WorkspacePreferencesPage />} />
          </Route>

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

          {/* /campaigns (old workspace landing) → root */}
          <Route path="/campaigns" element={<Navigate to="/" replace />} />

          {/* Any other path → root. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
