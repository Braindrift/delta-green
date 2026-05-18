/**
 * Layout for the campaign-management subtree (`/campaigns/:campaignId/manage/*`).
 *
 * Per the Option B layering decision: campaign-level management actions
 * (Members, Settings, transfer, delete) live in the *Workspace* shell, not
 * inside the Campaign shell. The visual chrome is the same Header + Workspace
 * sidebar a player sees on `/`, with a breadcrumb strip below it that names
 * the campaign being managed.
 *
 * ## Provider stack
 *
 *   <CampaignProvider>             ← resolves :campaignId → Campaign row
 *     <CampaignGuard>              ← redirects on invalid / inaccessible id
 *       <ManageGuard>              ← redirects non-Handlers to /
 *         <WorkspaceLayout shell>  ← Header + WorkspaceSidebar + Outlet
 *
 * `CampaignProvider` lives here rather than in `App.tsx` so the campaign
 * fetch only fires on the manage subtree. Mounting it higher would also
 * pull in the campaign-shell mount (R-2 / DEL-39) and cause a second
 * provider for the same route, which would work but duplicate the request.
 *
 * ## Breadcrumb
 *
 * The breadcrumb strip sits between the header and the content scroll
 * region — analogous to `Toolbar` in the campaign shell, but Workspace-flavoured
 * (no record-import/export buttons, no NewRecordMenu). It reads the current
 * sub-segment from the URL and the campaign name from `useCurrentCampaign`.
 *
 * ## Sidebar choice
 *
 * The wireframe was ambiguous on whether the Workspace sidebar or a
 * sub-sidebar shows here. Defaulting to the Workspace sidebar matches the
 * "management lives in the Workspace layer" mental model and keeps the
 * Campaigns nav item highlighted as the user's current context.
 */

import { Outlet, useLocation } from 'react-router-dom';

import { CampaignGuard } from '@/components/layout/CampaignGuard';
import { Header } from '@/components/layout/Header';
import { ManageGuard } from '@/components/layout/ManageGuard';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import { CampaignProvider, useCurrentCampaign } from '@/contexts/CampaignContext';

export function ManageLayout() {
  return (
    <CampaignProvider>
      <CampaignGuard>
        <ManageGuard>
          <div className="dg-app-root flex flex-col h-screen w-screen overflow-hidden bg-desk text-paper font-ui">
            <Header />
            <div className="flex flex-1 overflow-hidden">
              <WorkspaceSidebar />
              <main className="dg-content flex-1 flex flex-col overflow-hidden relative">
                <ManageBreadcrumb />
                <div className="dg-content-area flex-1 overflow-y-auto px-10 py-9 relative z-[1]">
                  <Outlet />
                </div>
              </main>
            </div>
          </div>
        </ManageGuard>
      </CampaignGuard>
    </CampaignProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb                                                                */
/* -------------------------------------------------------------------------- */

const SECTION_LABELS: Record<string, string> = {
  members: 'MEMBERS',
  settings: 'SETTINGS',
};

function ManageBreadcrumb() {
  const { campaign } = useCurrentCampaign();
  const location = useLocation();

  // Last URL segment of `/campaigns/:id/manage/<section>` — fall back to
  // `MANAGE` if we're on the parent (the index redirect should make this
  // unreachable, but keep the label total).
  const segments = location.pathname.split('/').filter(Boolean);
  const tail = segments[segments.length - 1] ?? 'manage';
  const section = SECTION_LABELS[tail] ?? tail.toUpperCase();

  const campaignLabel =
    (campaign?.codename ?? campaign?.name ?? 'CAMPAIGN').toUpperCase();

  return (
    <div className="dg-toolbar h-[46px] border-b border-green-dim flex items-center px-7 gap-3 flex-shrink-0 relative z-[2]">
      <div className="font-ui text-[10px] text-green-bright tracking-[0.15em] uppercase">
        {campaignLabel}{' '}
        <span className="text-green-mid mx-[2px]">/</span>{' '}
        <span className="text-green-accent">{section}</span>
      </div>
    </div>
  );
}
