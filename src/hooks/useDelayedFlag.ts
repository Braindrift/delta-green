/**
 * Gates a boolean (typically a loading flag) so it only "turns on" after
 * it has been continuously true for `delayMs`. Used to suppress brief
 * spinner flashes on fast loads while still surfacing the loading state
 * for genuinely slow ones (DEL-82).
 *
 * Semantics:
 *   - `active === false` → returns `false` immediately, cancels any pending
 *     show.
 *   - `active === true`  → schedules a `setTimeout(delayMs)`; if `active`
 *     is still true when it fires, returns `true`. Otherwise the timer is
 *     cleared on the next effect run and nothing flashes.
 *
 * The default delay (180ms) lines up with the perceptual threshold for
 * "instant" UI feedback — short enough that a slow load still feels
 * responsive when the spinner appears, long enough that a typical
 * sub-100ms fetch never paints a spinner.
 */

import { useEffect, useState } from 'react';

export function useDelayedFlag(active: boolean, delayMs: number = 180): boolean {
  const [reached, setReached] = useState(false);

  useEffect(() => {
    if (!active) {
      // Microtask defer for the reset keeps `setState` out of the
      // synchronous effect body (react-hooks/set-state-in-effect). The
      // `active && reached` return guards against any stale `true`
      // between the !active transition and this reset landing, so the
      // microtask gap is invisible to callers.
      queueMicrotask(() => setReached(false));
      return;
    }
    const id = window.setTimeout(() => setReached(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return active && reached;
}
