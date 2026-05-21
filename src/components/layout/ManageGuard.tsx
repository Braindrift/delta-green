/**
 * Handler-only access gate for the campaign-management subtree
 * (`/campaigns/:campaignId/manage/*`).
 *
 * Sits *inside* `CampaignGuard`, so by the time this component runs the
 * caller is already known to be an active member of the campaign and the
 * campaign row is loaded. The only remaining question is "are they the
 * Handler?" — answered by `useCurrentCampaignRole`.
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
 * ## Why the hook, not a local fetch
 *
 * DEL-74 swept Handler-gated surfaces onto `useCurrentCampaignRole`, the
 * single source of truth for "what's my role in this campaign?". The
 * hook handles the campaign-loading / no-auth / fetch-failure machinery
 * the local effect used to do here, and centralises the answer so any
 * future co-Handler refactor has one decision point.
 *
 * ## Toast firing
 *
 * The denied toast is fired from an effect that watches for the denied
 * transition, so the React render that mounts the `<Navigate>` is
 * preceded by a queued `showToast`. `ToastProvider`'s dedupe window
 * (200ms) absorbs the strict-mode double-invoke.
 */

import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useToast } from '@/contexts/ToastContext';
import { useCurrentCampaignRole } from '@/hooks/useCurrentCampaignRole';

export function ManageGuard({ children }: { children: ReactNode }) {
  const { isGM, isLoading, error } = useCurrentCampaignRole();
  const { showToast } = useToast();

  // `error` collapses into the denied branch — the hook only surfaces
  // unknown fetch failures here, and treating those as "not Handler" is
  // the safe redirect-out behaviour. `isLoading` covers both the
  // campaign-context and role-fetch loading states.
  const denied = !isLoading && !isGM;

  useEffect(() => {
    if (denied) {
      showToast(
        'error',
        'You need Handler permissions to manage this campaign.',
      );
    }
    // `error` is intentionally watched so a fetch failure that flips
    // `denied` true still fires the toast.
  }, [denied, error, showToast]);

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
