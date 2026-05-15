/**
 * Loading splash shown by `ProtectedRoute` while the initial session
 * check is in flight.
 *
 * The TODO in `ProtectedRoute` said "Replace with a proper splash
 * component when DEL-15 lands and we have a designed loading state."
 * This is that component.
 *
 * Visual mood-match: full-viewport desk background, DG seal centred, a
 * pulsing green dot and the phrase "ESTABLISHING SECURE CONNECTION" —
 * which is a callback to the authenticated header's static "SECURE
 * CONNECTION" indicator. By the time the user lands in the app the dot
 * stops pulsing and goes static; until then it's reaching for the
 * session.
 *
 * Kept inside `components/auth/` because it's only ever rendered around
 * an auth boundary (ProtectedRoute, before the session hydrates).
 */

export function Splash() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="dg-app-root min-h-screen w-screen bg-desk text-paper font-ui flex flex-col items-center justify-center gap-6"
    >
      <div className="dg-header-seal w-16 h-16 rounded-full border border-green-mid flex items-center justify-center font-display text-[18px] font-semibold text-green-accent relative">
        DG
      </div>

      <div className="flex items-center gap-[10px] font-ui text-[10px] tracking-[0.22em] text-green-bright uppercase">
        <span className="dg-status-dot inline-block w-[6px] h-[6px] rounded-full bg-green-accent" />
        Establishing Secure Connection
      </div>

      <span className="sr-only">Loading.</span>
    </div>
  );
}
