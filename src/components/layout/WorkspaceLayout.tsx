import { Outlet } from 'react-router-dom';

import { Header } from '@/components/layout/Header';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import { NotificationsProvider } from '@/contexts/NotificationsContext';

export function WorkspaceLayout() {
  return (
    <NotificationsProvider>
      <div className="dg-app-root flex flex-col h-screen w-screen overflow-hidden bg-desk text-paper font-ui">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <WorkspaceSidebar />
          <main className="dg-content flex-1 flex flex-col overflow-hidden relative">
            <div className="dg-content-area flex-1 overflow-y-auto px-10 py-9 relative z-[1]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </NotificationsProvider>
  );
}
