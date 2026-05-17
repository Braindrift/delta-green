/**
 * Route guard for the campaign shell.
 *
 * Sits between `CampaignProvider` and the layout. Shows a loading screen
 * while the campaign fetch is in flight; redirects to `/campaigns` if the
 * campaign is invalid, inaccessible, or otherwise unavailable.
 *
 * By the time `children` render, `useCurrentCampaign().campaign` is
 * guaranteed non-null — consumers inside the layout can rely on this.
 */

import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useCurrentCampaign } from '@/contexts/CampaignContext';

export function CampaignGuard({ children }: { children: ReactNode }) {
  const { campaign, isLoading } = useCurrentCampaign();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-desk">
        <span className="font-ui text-[11px] tracking-[0.15em] text-green-dim animate-pulse">
          LOADING...
        </span>
      </div>
    );
  }

  if (!campaign) {
    return <Navigate to="/campaigns" replace />;
  }

  return <>{children}</>;
}
