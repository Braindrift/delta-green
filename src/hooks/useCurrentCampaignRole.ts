/**
 * `useCurrentCampaignRole` — resolves the authenticated user's role inside
 * the campaign currently in the URL.
 *
 * DEL-38 deliberately kept `CampaignContext` minimal ("don't fetch members
 * or roles here — role-aware variants can be a separate hook later"). DEL-60
 * is that follow-up. This hook is the single source of truth for "am I the
 * Handler here?" / "am I a player?" decisions on every gated UI surface
 * (kick, invite, revoke, edit settings, transfer, delete, leave). Consumers
 * just call the hook; they don't need to know about `campaign_members`,
 * `useAuth`, or the fetch lifecycle.
 *
 * ## State machine
 *
 *   - Outside `/campaigns/:campaignId/...`:
 *       { role: null, isGM: false, isPlayer: false, isLoading: false,
 *         error: null }
 *   - Campaign mid-load (mirrors `useCurrentCampaign().isLoading`):
 *       { role: null, ..., isLoading: true, error: null }
 *   - Campaign load failed (`useCurrentCampaign().error` is non-null) or
 *     no auth user:
 *       { role: null, ..., isLoading: false, error: null }
 *     The campaign-context error is intentionally NOT mirrored here. The
 *     caller already has `useCurrentCampaign()` for that surface; this hook
 *     reports only its own fetch failures so consumers can branch on a
 *     single source per concern.
 *   - Role mid-fetch:
 *       { role: null, ..., isLoading: true, error: null }
 *   - Active member, Handler:
 *       { role: 'gm', isGM: true, isPlayer: false, isLoading: false,
 *         error: null }
 *   - Active member, player:
 *       { role: 'player', isGM: false, isPlayer: true, isLoading: false,
 *         error: null }
 *   - No active membership (`former` row, or no row at all — the data
 *     layer collapses these to `ok(null)`):
 *       { role: null, ..., isLoading: false, error: null }
 *   - Unexpected fetch failure:
 *       { role: null, ..., isLoading: false,
 *         error: { kind: 'unknown', cause } }
 *
 * ## Why per-consumer fetch (not in CampaignContext, not a sibling provider)
 *
 * Gated UI in Phase 3.5 is sparse: a handful of buttons in the Members
 * screen and the Settings subtree. (`CampaignInfoPanel` is the deliberate
 * exception — it takes `role` as a prop because the landing page has no
 * `:campaignId` segment, so the hook would be idle there; see its docstring.)
 * The extra round-trip per mount is negligible against the simplicity of
 * keeping the hook self-contained. If the hook ever becomes hot (many
 * concurrent consumers in the same route), the natural next step is to
 * lift the fetch into a sibling `<CampaignRoleProvider>` — the hook's
 * public shape is designed to absorb that change without consumer edits.
 *
 * ## Effect pattern
 *
 * Mirrors `CampaignContext` and `useRecordCounts`:
 *   - State transitions inside the effect body are queued through
 *     `Promise.resolve().then(...)` to satisfy
 *     `react-hooks/set-state-in-effect`.
 *   - A `cancelled` closure flag is checked in every setState site so a
 *     fast navigation away from the campaign route does not write a
 *     stale role into the unmounted (or remounted-for-a-different-id)
 *     hook instance.
 *   - The loaded slot stores both `campaignId` AND `userId`, so a sign-out
 *     + sign-in as a different user invalidates the cached role without
 *     waiting for the new fetch to land.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import { getMyMembershipRole } from '@/lib/members';
import type { CampaignMemberRole } from '@/types/members';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type CurrentCampaignRoleError = { kind: 'unknown'; cause: unknown };

export type CurrentCampaignRole = {
  role: CampaignMemberRole | null;
  isGM: boolean;
  isPlayer: boolean;
  isLoading: boolean;
  error: CurrentCampaignRoleError | null;
};

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

/** "Nothing to compute, not waiting" — the literal idle return. */
const IDLE: CurrentCampaignRole = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: false,
  error: null,
};

/** "We're waiting on something" — used in both campaign- and role-loading states. */
const LOADING: CurrentCampaignRole = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: true,
  error: null,
};

export function useCurrentCampaignRole(): CurrentCampaignRole {
  const {
    campaign,
    isLoading: campaignLoading,
    error: campaignError,
  } = useCurrentCampaign();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const campaignId = campaign?.id ?? null;

  // Loaded slot is keyed by the (campaignId, userId) pair the value was
  // resolved for. Storing both keys lets the derivation reject the cache
  // on either dimension changing — navigating between campaigns OR
  // signing in as a different user.
  const [loaded, setLoaded] = useState<{
    campaignId: string;
    userId: string;
    role: CampaignMemberRole | null;
    error: CurrentCampaignRoleError | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // No campaign in scope or no auth user → nothing to fetch. Clear stale
    // data so a previous campaign's role doesn't leak through.
    if (!campaignId || !userId) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoaded(null);
      });
      return () => {
        cancelled = true;
      };
    }

    // Enter mid-fetch state by clearing the cache. The derivation below
    // turns "loaded === null while ids are set" into isLoading: true.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoaded(null);
    });

    void getMyMembershipRole(campaignId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLoaded({ campaignId, userId, role: result.data, error: null });
        return;
      }
      // Any non-ok result from the data layer (`not_found` is folded into
      // `ok(null)` by `getMyMembershipRole` itself, so this branch is only
      // `forbidden` / `conflict` / `unknown`) collapses to the unknown
      // surface. Consumers branching on `error.kind` only ever see one
      // kind here. `'cause' in result` narrows out the `not_found`
      // variant, which is unreachable but still part of the `Err` union
      // typewise.
      const cause = 'cause' in result ? result.cause : undefined;
      setLoaded({
        campaignId,
        userId,
        role: null,
        error: { kind: 'unknown', cause },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, userId]);

  // Campaign is still loading → mirror that. The campaign hasn't resolved
  // yet, so the role question is unanswerable.
  if (campaignLoading) return LOADING;

  // Campaign load errored, route has no campaign segment, or no auth user.
  // All collapse to the idle/no-role state; callers can distinguish among
  // them via `useCurrentCampaign()` / `useAuth()` if they care.
  if (campaignError || !campaignId || !userId) return IDLE;

  // Fetch hasn't landed yet for the current (campaignId, userId) pair.
  if (!loaded || loaded.campaignId !== campaignId || loaded.userId !== userId) {
    return LOADING;
  }

  return {
    role: loaded.role,
    isGM: loaded.role === 'gm',
    isPlayer: loaded.role === 'player',
    isLoading: false,
    error: loaded.error,
  };
}
