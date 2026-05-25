/**
 * Suspense fallback for lazily-loaded route leaves.
 *
 * Rendered inside a layout's content area (header + sidebar already
 * painted) while the route's JS chunk is fetched, so it fills the content
 * region rather than the whole viewport. Visual language matches the
 * `CampaignGuard` loading screen.
 */
export function RouteFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-ui text-[11px] tracking-[0.15em] text-green-dim animate-pulse">
        LOADING...
      </span>
    </div>
  );
}
