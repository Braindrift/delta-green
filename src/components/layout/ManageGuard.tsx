/**
 * Handler-only access gate for the campaign-management subtree
 * (`/campaigns/:campaignId/manage/*`).
 *
 * Sits *inside* `CampaignGuard`, so by the time this component runs the
 * caller is already known to be an active member of the campaign and the
 * campaign row is loaded. The only remaining question is "are they the
 * Handler?" — answered by `useCurrentCampaignRole` (DEL-60), the single
 * source of truth for route-scoped role decisions.
 *
 * Three outcomes:
 *
 *   1. Handler — renders `children`.
 *   2. Active Agent / no membership / fetch error — redirects to `/` and
 *      fires an error toast. The redirect intentionally lands on the
 *      workspace landing page, not back into the campaign, so a player who
 *      clicked a stale link sees the campaign list rather than an empty
 *      management screen. Fetch errors collapse into the same branch
 *      because "every action will fail" is indistinguishable from "you
 *      shouldn't be here" from the user's perspective.
 *   3. Loading — shows the same `LOADING...` stamp as `CampaignGuard` for
 *      visual continuity. The two guards share a `<div>`-level structure
 *      on purpose.
 *
 * ## Why a UI guard at all when RLS already covers writes
 *
 * Server-side RLS (`is_campaign_gm`) is the source of truth for every
 * management action's authorisation. This guard is purely a UX layer:
 * non-Handlers loading `/manage/*` would otherwise see a screen full of
 * RLS-blocked widgets and read errors. The redirect + toast turns "every
 * action will fail" into "you can't be here".
 *
 * ## Toast dedupe
 *
 * The toast fires from an effect keyed on the denied state, so the React
 * render that mounts the `<Navigate>` is preceded by a queued `showToast`.
 * `ToastProvider`'s dedupe window (200ms) absorbs the strict-mode
 * double-invoke.
 */

import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useToast } from '@/contexts/ToastContext';
import { useCurrentCampaignRole } from '@/hooks/useCurrentCampaignRole';

export function ManageGuard({ children }: { children: ReactNode }) {
  const { isGM, isLoading } = useCurrentCampaignRole();
  const { showToast } = useToast();

  // The denial branch covers three distinct hook states — active player,
  // no membership (`role === null` with no error), and unknown fetch
  // failure. All three should bounce the caller out of the management
  // subtree with the same message; the hook's own error surface stays
  // separate so consumers that care can branch on it.
  const denied = !isLoading && !isGM;

  useEffect(() => {
    if (!denied) return;
    showToast(
      'error',
      'You need Handler permissions to manage this campaign.',
    );
    // `role` and `error` are intentionally not in the dep array — the
    // toast is keyed on the denied transition, not on the specific reason.
    // Re-firing when the reason refines (e.g. role load → role=null) would
    // double-toast on a single denial.
  }, [denied, showToast]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="font-ui text-[11px] tracking-[0.15em] text-green-dim animate-pulse">
          VERIFYING CLEARANCE...
        </span>
      </div>
    );
  }

  if (denied) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
