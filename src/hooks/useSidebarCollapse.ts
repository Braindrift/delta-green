/**
 * Persists the open/closed state of the sidebar nav groups to
 * `localStorage`, so a refresh keeps the user's last layout.
 *
 * Storage shape: a single JSON object keyed by group id (one of
 * `'operations' | 'subjects' | 'entities' | 'events'`), value `boolean`
 * (true = collapsed). Missing keys default to "open" — when a new group
 * lands in `navConfig.ts` the user sees it open the first time, which is
 * the right default for "discover-the-new-thing".
 *
 * The single-object shape is a deliberate departure from the pattern of
 * one key per group. It (a) makes per-user-cleanup trivial (one key, one
 * removeItem), (b) doesn't pollute the localStorage keyspace, and (c)
 * survives unrelated localStorage clears better since it's named-coupled
 * to the feature.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dg-sidebar-collapse-v1';

type CollapseMap = Readonly<Record<string, boolean>>;

function readFromStorage(): CollapseMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    // Filter to only boolean-valued keys; ignore anything corrupted.
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    // Corrupted JSON or storage unavailable — fall back to defaults.
    return {};
  }
}

function writeToStorage(map: CollapseMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // QuotaExceededError or storage-disabled — silently degrade. The
    // collapse state will still work for the current session.
  }
}

/**
 * @returns A tuple of `[isCollapsed, toggle]` per group, with `toggle`
 *  stable across renders.
 */
export function useSidebarCollapse(): {
  isCollapsed: (groupId: string) => boolean;
  toggle: (groupId: string) => void;
} {
  const [state, setState] = useState<CollapseMap>(readFromStorage);

  // Write-through on every change. We re-read on mount via the initialiser
  // above, which handles the "user opened a second tab" case gracefully
  // for the first render. Cross-tab live sync is intentionally not
  // implemented — collapse state across tabs is more annoying than
  // helpful (users alt-tab and see groups snap closed).
  useEffect(() => {
    writeToStorage(state);
  }, [state]);

  const isCollapsed = useCallback(
    (groupId: string): boolean => state[groupId] === true,
    [state],
  );

  const toggle = useCallback((groupId: string): void => {
    setState((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  return { isCollapsed, toggle };
}
