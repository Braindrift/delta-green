/**
 * Workspace landing placeholder — R-3 / DEL-?.
 *
 * Until the full workspace shell lands, this page acts as the entry point
 * at `/campaigns`. It fetches the user's campaigns and auto-redirects to
 * the first one. If the user has no campaigns, it shows a minimal empty
 * state.
 *
 * CLEANUP when R-3 lands: delete this file and replace the `/campaigns`
 * route in `App.tsx` with the real `WorkspacePage` component.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_NAV_SEGMENT, campaignPath } from '@/components/layout/navConfig';
import { listCampaigns } from '@/lib/campaigns';

export function CampaignsIndexPage() {
  const navigate = useNavigate();
  const [hasNoCampaigns, setHasNoCampaigns] = useState(false);

  useEffect(() => {
    void listCampaigns().then((result) => {
      if (result.ok && result.data.length > 0) {
        navigate(campaignPath(result.data[0].id, DEFAULT_NAV_SEGMENT), { replace: true });
      } else {
        setHasNoCampaigns(true);
      }
    });
  }, [navigate]);

  if (hasNoCampaigns) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-desk">
        <div className="text-center space-y-3">
          <p className="font-ui text-[11px] tracking-[0.15em] text-green-dim">
            NO CAMPAIGNS FOUND
          </p>
          <p className="font-ui text-[10px] tracking-[0.1em] text-green-mid">
            WORKSPACE SHELL COMING IN R-3
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-desk">
      <span className="font-ui text-[11px] tracking-[0.15em] text-green-dim animate-pulse">
        LOADING...
      </span>
    </div>
  );
}
