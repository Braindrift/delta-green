import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { ManageLayout } from '@/components/layout/ManageLayout';
import { DEFAULT_NAV_SEGMENT } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { InviteAcceptPage } from '@/pages/InviteAcceptPage';
import { InviteTokenPage } from '@/pages/InviteTokenPage';
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
import { ManageMembersPage } from '@/pages/manage/ManageMembersPage';
import { ManageSettingsPage } from '@/pages/manage/ManageSettingsPage';
import { CampaignsLandingPage } from '@/pages/workspace/CampaignsLandingPage';
import { CreateCampaignPage } from '@/pages/workspace/CreateCampaignPage';
import { WorkspaceAgentsPage } from '@/pages/workspace/WorkspaceAgentsPage';
import { WorkspaceNotificationsPage } from '@/pages/workspace/WorkspaceNotificationsPage';
import { WorkspaceBrowsePage } from '@/pages/workspace/WorkspaceBrowsePage';
import { WorkspaceProfilePage } from '@/pages/workspace/WorkspaceProfilePage';
import { WorkspaceAccountPage } from '@/pages/workspace/WorkspaceAccountPage';
import { WorkspacePreferencesPage } from '@/pages/workspace/WorkspacePreferencesPage';

/**
 * Route table.
 *
 * Auth screens are public. Authenticated routes split into three protected
 * subtrees:
 *
 *   Workspace shell  — `/`, `/agents`, `/notifications`, `/browse`, and
 *                      account stubs. `WorkspaceLayout` renders the shared
 *                      header + workspace sidebar.
 *
 *   Manage subtree   — `/campaigns/:campaignId/manage/*`. `ManageLayout`
 *                      mounts `CampaignProvider` + `CampaignGuard` +
 *                      `ManageGuard` so only the active Handler can land
 *                      here. Uses the workspace chrome (campaign
 *                      management is a workspace-layer concern, not a
 *                      campaign-shell one).
 *
 *   Campaign shell   — `/campaigns/:campaignId/*` (other paths). `AppLayout`
 *                      mounts `CampaignProvider` + `CampaignGuard` so every
 *                      descendant has a guaranteed non-null campaign.
 *
 * The leaf paths in the campaign shell mirror `NAV_GROUPS` in `navConfig.ts`,
 * the single source of truth for sidebar links.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordRequestPage />} />
          <Route path="/reset-password/confirm" element={<ResetPasswordPage />} />

          {/* Magic-link invite landing (DEL-45). Public — the
              `get_invitation_by_token` RPC works without auth, and the
              page routes signed-in/signed-out users into the right flow. */}
          <Route path="/invite/:token" element={<InviteTokenPage />} />

          {/* Workspace shell */}
          <Route
            element={
              <ProtectedRoute>
                <WorkspaceLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CampaignsLandingPage />} />
            <Route path="campaigns/new" element={<CreateCampaignPage />} />
            <Route path="agents" element={<WorkspaceAgentsPage />} />
            <Route path="notifications" element={<WorkspaceNotificationsPage />} />
            <Route path="browse" element={<WorkspaceBrowsePage />} />
            <Route path="profile" element={<WorkspaceProfilePage />} />
            <Route path="account" element={<WorkspaceAccountPage />} />
            <Route path="preferences" element={<WorkspacePreferencesPage />} />
            {/* In-app accept-invite flow (DEL-46). Reached from the
                notifications inbox or from `InviteTokenPage` after a
                successful claim of a magic-link invite. */}
            <Route
              path="invitations/:invitationId"
              element={<InviteAcceptPage />}
            />
          </Route>

          {/* Campaign-management subtree (workspace-chrome, Handler-only) */}
          <Route
            path="/campaigns/:campaignId/manage"
            element={
              <ProtectedRoute>
                <ManageLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="members" replace />} />
            <Route path="members" element={<ManageMembersPage />} />
            <Route path="settings" element={<ManageSettingsPage />} />
            {/* Unknown management sub-path → bounce to members. */}
            <Route path="*" element={<Navigate to="members" replace />} />
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
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
