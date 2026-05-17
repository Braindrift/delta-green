/**
 * The authenticated application shell.
 *
 * Top-level structure (per design doc §4):
 *
 *   <Header />
 *   <workspace>
 *     <Sidebar />
 *     <content>
 *       <Toolbar />
 *       <Outlet />
 *     </content>
 *   </workspace>
 *
 * The form panel and the polaroid overlay (design doc §4.5, §4.6) are
 * scoped to DEL-17 and the photo-system tickets respectively — neither is
 * mounted from here.
 *
 * Rendered only inside a `<ProtectedRoute>`, which guarantees `useAuth()`
 * has a session by the time this component mounts.
 */

import { Outlet } from 'react-router-dom';

import { CampaignGuard } from '@/components/layout/CampaignGuard';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toolbar } from '@/components/layout/Toolbar';
import { CampaignProvider } from '@/contexts/CampaignContext';

/**
 * Campaign shell layout. Mounts `CampaignProvider` so the campaign is
 * resolved from the `:campaignId` route param, then gates children behind
 * `CampaignGuard` (shows a loading screen; redirects on error). By the
 * time the layout content renders, `useCurrentCampaign().campaign` is
 * guaranteed to be non-null.
 */
export function AppLayout() {
  return (
    <CampaignProvider>
      <CampaignGuard>
        <div className="dg-app-root flex flex-col h-screen w-screen overflow-hidden bg-desk text-paper font-ui">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="dg-content flex-1 flex flex-col overflow-hidden relative">
              <Toolbar />
              <div className="dg-content-area flex-1 overflow-y-auto px-10 py-9 relative z-[1]">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </CampaignGuard>
    </CampaignProvider>
  );
}
