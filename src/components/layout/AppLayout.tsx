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

import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toolbar } from '@/components/layout/Toolbar';

export function AppLayout() {
  return (
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
  );
}
