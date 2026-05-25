import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { AppLayout } from '@/components/layout/AppLayout';
import { DEFAULT_NAV_SEGMENT } from '@/components/layout/navConfig';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';

// Auth + invite-token landing stay eager: they're the unauthenticated
// entry points, so lazy-loading them would only add a chunk fetch to the
// very first paint. Everything behind `ProtectedRoute` is code-split via
// `React.lazy` so `/login` no longer downloads the whole authenticated app.
import { InviteTokenPage } from '@/pages/InviteTokenPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { ResetPasswordRequestPage } from '@/pages/ResetPasswordRequestPage';
import { SignupPage } from '@/pages/SignupPage';

const InviteAcceptPage = lazy(() =>
  import('@/pages/InviteAcceptPage').then((m) => ({ default: m.InviteAcceptPage })),
);
const TransferAcceptPage = lazy(() =>
  import('@/pages/TransferAcceptPage').then((m) => ({ default: m.TransferAcceptPage })),
);

const CampaignsLandingPage = lazy(() =>
  import('@/pages/workspace/CampaignsLandingPage').then((m) => ({
    default: m.CampaignsLandingPage,
  })),
);
const CreateCampaignPage = lazy(() =>
  import('@/pages/workspace/CreateCampaignPage').then((m) => ({
    default: m.CreateCampaignPage,
  })),
);
const WorkspaceNotificationsPage = lazy(() =>
  import('@/pages/workspace/WorkspaceNotificationsPage').then((m) => ({
    default: m.WorkspaceNotificationsPage,
  })),
);
const WorkspaceBrowsePage = lazy(() =>
  import('@/pages/workspace/WorkspaceBrowsePage').then((m) => ({
    default: m.WorkspaceBrowsePage,
  })),
);
const WorkspaceProfilePage = lazy(() =>
  import('@/pages/workspace/WorkspaceProfilePage').then((m) => ({
    default: m.WorkspaceProfilePage,
  })),
);
const WorkspaceAccountPage = lazy(() =>
  import('@/pages/workspace/WorkspaceAccountPage').then((m) => ({
    default: m.WorkspaceAccountPage,
  })),
);
const WorkspacePreferencesPage = lazy(() =>
  import('@/pages/workspace/WorkspacePreferencesPage').then((m) => ({
    default: m.WorkspacePreferencesPage,
  })),
);

// Campaign-section leaves are named exports of one barrel
// (`pages/sections/index.tsx`); lazy-importing them coalesces into a single
// shared `sections` chunk, which is fine for these throwaway placeholders.
const AgentsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.AgentsPage })),
);
const ArtifactsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.ArtifactsPage })),
);
const AssetsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.AssetsPage })),
);
const CiviliansPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.CiviliansPage })),
);
const EventsAllPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.EventsAllPage })),
);
const GlobalAffairsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.GlobalAffairsPage })),
);
const HeadlinesPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.HeadlinesPage })),
);
const IncidentsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.IncidentsPage })),
);
const LocationsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.LocationsPage })),
);
const OperationsActivePage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.OperationsActivePage })),
);
const OperationsAllPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.OperationsAllPage })),
);
const OperationsClosedPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.OperationsClosedPage })),
);
const OperationsCompromisedPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.OperationsCompromisedPage })),
);
const OrganisationsPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.OrganisationsPage })),
);
const PoiPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.PoiPage })),
);
const UnnaturalPage = lazy(() =>
  import('@/pages/sections').then((m) => ({ default: m.UnnaturalPage })),
);

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
