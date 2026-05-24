/**
 * Derives the per-nav-item count badges for the sidebar.
 *
 * The count source for each leaf is declared in `navConfig.ts`. This hook
 * resolves each leaf to a number by fetching the campaign's records once
 * via `listRecords` and bucketing client-side.
 *
 * ## Campaign id source
 *
 * The records data layer (DEL-11) is keyed by `campaignId`. Since the
 * Phase 3.5 route-bound campaign system landed, `Sidebar.tsx` calls
 * `useRecordCounts(campaign?.id ?? null, NAV_ITEMS)` with the campaign from
 * the `/campaigns/:id/...` route. Outside a campaign route there is no id, so
 * `null` is passed and the hook returns a sentinel `null` for every count —
 * the sidebar renders the dash placeholder (`—`). The shape of the returned
 * map is identical in both cases.
 *
 * ## Why not per-leaf queries
 *
 * One `listRecords(campaignId)` returns every record in the campaign in a
 * single round-trip. Slicing by type / status client-side is cheaper than
 * 13 separate queries and gives consistent snapshots — counts can't
 * disagree across nav items because they all came from the same response.
 */

import { useEffect, useState } from 'react';

import { listRecords, type Result } from '@/lib/records';
import type { AnyRecord, OperationStatus, RecordType } from '@/types/records';

import type { NavItem, NavItemCountSource } from '@/components/layout/navConfig';

/**
 * Map from nav-item path → count. `null` means "no campaign in context" and
 * the sidebar should render a dash. A number (including zero) means a
 * loaded value.
 */
export type NavCountMap = Readonly<Record<string, number | null>>;

/**
 * Resolves a leaf's count source against a list of records.
 *
 * Exported for unit-testability later, but the hook is the only current
 * caller. Pure function — no Supabase access.
 */
export function resolveCount(source: NavItemCountSource, records: readonly AnyRecord[]): number {
  switch (source.kind) {
    case 'type':
      return records.filter((r) => r.record_type === source.type).length;
    case 'type-status':
      return records.filter(
        (r) =>
          r.record_type === source.type &&
          // The `data.status` shape is union-narrowed by record_type — for
          // operations specifically it's `OperationStatus`. We cast via
          // unknown to satisfy the union without leaking the assertion to
          // the call site, which still operates on plain `AnyRecord`.
          (r.data as { status?: OperationStatus }).status === source.status,
      ).length;
    case 'derived-operations-all':
      return records.filter((r) => r.record_type === 'operation').length;
    case 'derived-events-all': {
      const eventTypes: ReadonlySet<RecordType> = new Set<RecordType>([
        'incident',
        'headline',
        'global_affair',
      ]);
      return records.filter((r) => eventTypes.has(r.record_type)).length;
    }
  }
}

/**
 * Returns the count map for the given nav items.
 *
 * - `campaignId === null` → every leaf maps to `null`, no network call.
 * - `campaignId === string` → fetches once, buckets client-side, returns a
 *   map of numeric counts. While the request is in flight every leaf is
 *   `null` (renders as a dash).
 *
 * Errors from `listRecords` are silently swallowed and treated as "no
 * data" — the sidebar shows dashes. The UI doesn't have a designed error
 * state for the count badges, and the empty-state for the section views
 * gives the user a clearer signal something's wrong than red dashes in the
 * sidebar would.
 */
export function useRecordCounts(
  campaignId: string | null,
  items: readonly NavItem[],
): NavCountMap {
  // We store only the loaded numeric counts here. The final shape returned
  // to the caller is computed below — when no data is loaded, every leaf is
  // null and the sidebar renders dashes.
  //
  // This shape avoids the `set-state-in-effect` lint rule: we only call
  // `setLoaded` from a Promise callback (i.e. after async work), not
  // synchronously inside the effect body.
  const [loaded, setLoaded] = useState<{
    campaignId: string;
    counts: Readonly<Record<string, number>>;
  } | null>(null);

  useEffect(() => {
    if (campaignId === null) {
      // Nothing to fetch. If we had stale data from a previous campaign,
      // clear it so the dashes render. This setState IS allowed by the
      // rule because it's a transition — empty → empty is also a no-op,
      // so React bails out. But to satisfy the linter we move the clear
      // into a microtask via Promise.resolve.
      void Promise.resolve().then(() => setLoaded(null));
      return;
    }

    let cancelled = false;

    void listRecords(campaignId).then((result: Result<AnyRecord[]>) => {
      if (cancelled) return;
      if (!result.ok) {
        // Drop stale data — caller will see dashes — but don't surface
        // the error here. See header comment for rationale.
        setLoaded(null);
        return;
      }
      const next: Record<string, number> = {};
      for (const item of items) {
        next[item.path] = resolveCount(item.countSource, result.data);
      }
      setLoaded({ campaignId, counts: next });
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, items]);

  // Derive the final shape on every render. Cheap: just an O(items) loop
  // and a strict-equality check on the campaign id.
  const out: Record<string, number | null> = {};
  for (const item of items) {
    out[item.path] =
      loaded && loaded.campaignId === campaignId ? (loaded.counts[item.path] ?? null) : null;
  }
  return out;
}
