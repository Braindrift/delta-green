import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { DEFAULT_NAV_SEGMENT } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { InviteAcceptPage } from '@/pages/InviteAcceptPage';
import { InviteTokenPage } from '@/pages/InviteTokenPage';
import { TransferAcceptPage } from '@/pages/TransferAcceptPage';
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
import { CreateCampaignPage } from '@/pages/workspace/CreateCampaignPage';
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
 *   Workspace shell  — `/`, `/notifications`, `/browse`, and
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
            {/* `/agents` used to host a full-width copy of the agent roster.
                Removed once the workspace landing already showed the same
                `AgentRosterPanel` in its right column; keep a redirect so
                older links/bookmarks don't 404. */}
            <Route path="agents" element={<Navigate to="/" replace />} />
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
            {/* Handler ownership-transfer recipient screen (DEL-49).
                Reached from the notifications inbox (DEL-50, deep-links via
                the `handler_transfer_requested` payload's `transfer_id`). */}
            <Route
              path="transfers/:transferId"
              element={<TransferAcceptPage />}
            />
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
