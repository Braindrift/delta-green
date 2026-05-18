/**
 * Handler-only access gate for the campaign-management subtree
 * (`/campaigns/:campaignId/manage/*`).
 *
 * Sits *inside* `CampaignGuard`, so by the time this component runs the
 * caller is already known to be an active member of the campaign and the
 * campaign row is loaded. The only remaining question is "are they the
 * Handler?" — answered by `getMyRoleInCampaign`.
 *
 * Three outcomes:
 *
 *   1. Handler — renders `children`.
 *   2. Active Agent (or any other non-Handler resolution) — redirects to
 *      `/` and fires an error toast. The redirect intentionally lands on
 *      the workspace landing page, not back into the campaign, so a player
 *      who clicked a stale link sees the campaign list rather than an
 *      empty management screen.
 *   3. Loading — shows the same `LOADING...` stamp as `CampaignGuard`
 *      for visual continuity. The two guards share a `<div>`-level
 *      structure on purpose.
 *
 * ## Why a UI guard at all when RLS already covers writes
 *
 * Server-side RLS (`is_campaign_gm`) is the source of truth for every
 * management action's authorisation. This guard is purely a UX layer:
 * non-Handlers loading `/manage/*` would otherwise see a screen full of
 * RLS-blocked widgets and read errors. The redirect + toast turns "every
 * action will fail" into "you can't be here".
 *
 * ## Effect ordering
 *
 * The toast is fired from the same effect that triggers the redirect, so
 * the React render that mounts the `<Navigate>` is preceded by a queued
 * `showToast`. `ToastProvider`'s dedupe window (200ms) absorbs the
 * strict-mode double-invoke.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useCurrentCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { getMyRoleInCampaign, type CampaignRole } from '@/lib/campaigns';

type RoleState =
  | { kind: 'loading' }
  | { kind: 'allowed' }
  | { kind: 'denied' };

export function ManageGuard({ children }: { children: ReactNode }) {
  const { campaign } = useCurrentCampaign();
  const { showToast } = useToast();
  const [state, setState] = useState<RoleState>({ kind: 'loading' });

  // `CampaignGuard` ensures `campaign` is non-null before this component
  // mounts. The optional chain on `campaign?.id` is defensive — if a future
  // refactor moves the mount point, the effect short-circuits instead of
  // throwing on `campaign.id`.
  const campaignId = campaign?.id;

  useEffect(() => {
    let cancelled = false;

    // Pre-fetch setState transitions are deferred via Promise.resolve() to
    // satisfy `react-hooks/set-state-in-effect`. The end-result ordering is
    // unchanged because both the effect body and the microtask run before
    // React commits the next paint — mirrors `CampaignContext.tsx`.
    if (!campaignId) {
      // Should be unreachable in production because CampaignGuard already
      // gated this branch, but keep the state machine total.
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setState({ kind: 'denied' });
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setState({ kind: 'loading' });
    });

    void getMyRoleInCampaign(campaignId).then((result) => {
      if (cancelled) return;

      const role: CampaignRole | null = result.ok ? result.data : null;
      if (role === 'gm') {
        setState({ kind: 'allowed' });
        return;
      }

      showToast(
        'error',
        'You need Handler permissions to manage this campaign.',
      );
      setState({ kind: 'denied' });
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, showToast]);

  if (state.kind === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="font-ui text-[11px] tracking-[0.15em] text-green-dim animate-pulse">
          VERIFYING CLEARANCE...
        </span>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
