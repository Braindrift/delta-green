/**
 * Campaign context: route-param-backed "current campaign" state.
 *
 * The provider reads `:campaignId` from the URL via `useParams`, fetches the
 * matching `campaigns` row via the RLS-protected data-access layer, and
 * exposes the result to descendants through `useCurrentCampaign`.
 *
 * ## Design — why this isn't a global picker
 *
 * There is no global "current campaign" anywhere in the app. Campaigns are
 * entered by URL navigation (`/campaigns/:campaignId/...`), and the hook
 * resolves which campaign is "current" by reading the URL. This keeps the
 * data flow uni-directional: navigation drives state, never the other way
 * round. It also makes deep links shareable and the back button behave
 * correctly across campaigns.
 *
 * ## Mounting
 *
 * This ticket (DEL-38) builds the provider but does not mount it. R-2 / DEL-39
 * wraps the campaign-shell route segment with `<CampaignProvider>` so the
 * fetches only fire inside `/campaigns/:campaignId/...`. The provider is
 * designed to be tolerant of being mounted *outside* a campaign-id route
 * too — in that case `:campaignId` is `undefined`, no fetch is fired, and
 * the hook returns the "no campaign in route" state. This makes the unit
 * testable in isolation and gives DEL-39 flexibility on the mount point.
 *
 * ## States exposed
 *
 *   - Outside a `/campaigns/:campaignId/...` route:
 *       { campaign: null, isLoading: false, error: null }
 *   - Inside route, malformed UUID:
 *       { campaign: null, isLoading: false, error: { kind: 'invalid_uuid' } }
 *   - Inside route, fetching:
 *       { campaign: null, isLoading: true,  error: null }
 *   - Inside route, fetched OK:
 *       { campaign: Campaign, isLoading: false, error: null }
 *   - Inside route, RLS-hidden or row missing:
 *       { campaign: null, isLoading: false, error: { kind: 'not_found_or_forbidden' } }
 *   - Inside route, unexpected failure:
 *       { campaign: null, isLoading: false, error: { kind: 'unknown', cause } }
 *
 * Consumers branch on `error.kind` for behaviour (e.g. kick to landing on
 * `not_found_or_forbidden`). The `isLoading` flag is exclusive with the
 * other states — there is no "mid-fetch with stale campaign" leak.
 *
 * ## Auth coupling
 *
 * The fetch is RLS-gated via `auth.uid()`. If the user signs out, an
 * in-flight request will fail with `not_found_or_forbidden` (no member
 * row → no read). The provider also subscribes to `useAuth().user?.id`
 * as an effect dependency so a sign-out + sign-in as a different user
 * re-fetches and clears any stale campaign state instead of holding a
 * row the new user can't actually see.
 *
 * ## Hook contract — out of provider = throw
 *
 * `useCurrentCampaign()` throws if called outside a `<CampaignProvider>`.
 * This matches `useAuth`'s behaviour and surfaces missing-provider bugs
 * loudly during development. The "no campaign in route" state is the
 * provider's responsibility, not a fallback for forgetting to mount it.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { getCampaignById } from '@/lib/campaigns';
import type { Campaign } from '@/types/campaigns';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Discriminated union of error variants. Mirrors the records data-access
 * layer's `Err` shape, but specialised to the cases this hook can produce.
 */
export type CampaignError =
  | { kind: 'invalid_uuid' }
  | { kind: 'not_found_or_forbidden' }
  | { kind: 'unknown'; cause: unknown };

export type CampaignContextValue = {
  campaign: Campaign | null;
  isLoading: boolean;
  error: CampaignError | null;
};

/* -------------------------------------------------------------------------- */
/*  UUID validation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4122 UUID matcher. Permissive on version (handles v1–v8) but strict on
 * structure — we want to reject anything that would round-trip as a Postgres
 * `22P02` error without paying for the round-trip. Anchored at both ends.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sentinel "not in provider" value. `undefined` lets `useCurrentCampaign`
 * detect the missing-provider case and throw, matching `useAuth`.
 */
const CampaignContext = createContext<CampaignContextValue | undefined>(undefined);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function CampaignProvider({ children }: { children: ReactNode }) {
  // `:campaignId` is undefined outside `/campaigns/:campaignId/...`.
  const { campaignId } = useParams<{ campaignId: string }>();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // The internal state is the load result keyed by the campaignId it
  // corresponds to. Keying lets us distinguish "loaded for THIS id" from
  // "loaded for a previous id that's now stale" when the user navigates
  // between campaigns. The mid-fetch state is represented by `loaded`
  // being null while `campaignId` is set — see derivation below.
  const [loaded, setLoaded] = useState<{
    campaignId: string;
    campaign: Campaign | null;
    error: CampaignError | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // No campaignId in the URL → not in a campaign route. Clear any prior
    // load so the derived state is { null, false, null }.
    //
    // Pre-fetch state transitions (clear-on-no-id, no-user, invalid-uuid,
    // enter-loading) are queued through a microtask via Promise.resolve()
    // rather than called synchronously. The `react-hooks/set-state-in-effect`
    // lint rule disallows synchronous setState inside an effect body — the
    // codebase's existing workaround (see `useRecordCounts.ts`) is the
    // microtask defer, which we match here for consistency. The end-result
    // ordering is unchanged because both this effect and the microtask run
    // before React commits the next paint.
    if (!campaignId) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoaded(null);
      });
      return () => {
        cancelled = true;
      };
    }

    // No authenticated user → no point trying. Surface as not_found_or_forbidden
    // since that's effectively what RLS would say. The auth gate at the
    // route layer should make this branch unreachable in practice, but it's
    // here so the provider is self-consistent in tests and degraded states.
    if (!userId) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoaded({
          campaignId,
          campaign: null,
          error: { kind: 'not_found_or_forbidden' },
        });
      });
      return () => {
        cancelled = true;
      };
    }

    // Client-side UUID validation. Avoids a round-trip on every typo and
    // gives the consumer a distinct error kind to handle (the kick-to-
    // landing decision can render a different message for "you typo'd"
    // vs "you don't have access").
    if (!isUuid(campaignId)) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoaded({
          campaignId,
          campaign: null,
          error: { kind: 'invalid_uuid' },
        });
      });
      return () => {
        cancelled = true;
      };
    }

    // Enter mid-fetch state by clearing `loaded`. The derived state then
    // becomes { null, true, null } — no stale campaign leak.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoaded(null);
    });

    void getCampaignById(campaignId).then((result) => {
      if (cancelled) return;

      if (result.ok) {
        setLoaded({ campaignId, campaign: result.data, error: null });
        return;
      }

      // The data layer returns `not_found` for both "no row" and "RLS
      // hid the row" — both surface here as not_found_or_forbidden.
      // `forbidden` (PostgREST `42501`) is theoretically possible for
      // writes, not reads — but we map it the same way to keep the
      // consumer surface simple.
      if (result.kind === 'not_found' || result.kind === 'forbidden') {
        setLoaded({
          campaignId,
          campaign: null,
          error: { kind: 'not_found_or_forbidden' },
        });
        return;
      }

      setLoaded({
        campaignId,
        campaign: null,
        error: { kind: 'unknown', cause: result.cause },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, userId]);

  // Derive the public-facing value from the internal state. The derivation
  // is the only place that makes the "mid-fetch is loading" decision, so
  // there's no risk of an inconsistent intermediate state being exposed.
  const value = useMemo<CampaignContextValue>(() => {
    if (!campaignId) {
      return { campaign: null, isLoading: false, error: null };
    }

    // `loaded === null` while a fetch is in flight (or before the effect
    // has run its first synchronous setLoaded for an invalid input). Both
    // are correctly "loading" from the consumer's perspective.
    if (!loaded || loaded.campaignId !== campaignId) {
      return { campaign: null, isLoading: true, error: null };
    }

    return {
      campaign: loaded.campaign,
      isLoading: false,
      error: loaded.error,
    };
  }, [campaignId, loaded]);

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Access the current campaign resolved from the URL.
 *
 * Throws if called outside a `<CampaignProvider>`. The "not in a campaign
 * route" state — where the URL has no `:campaignId` segment — is a valid
 * state the provider itself returns (`{ null, false, null }`); it is NOT a
 * fallback for forgetting to mount the provider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) {
    throw new Error('useCurrentCampaign must be used inside <CampaignProvider>');
  }
  return ctx;
}
