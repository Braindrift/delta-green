/**
 * Visually-hidden-until-focused "skip to main content" link.
 *
 * Rendered as the first focusable element inside the authenticated shells so
 * keyboard / AT users can bypass the sidebar on every page. Targets the
 * `<main>` via its `id` (the browser handles the focus jump via fragment
 * navigation — no JS needed).
 */

export type SkipToContentProps = {
  /** Fragment target — the `id` on the `<main>` element of the shell. */
  targetId: string;
};

export function SkipToContent({ targetId }: SkipToContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className={[
        'sr-only focus:not-sr-only',
        'focus:absolute focus:top-2 focus:left-2 focus:z-[100]',
        'focus:px-3 focus:py-2 focus:border focus:border-green-mid',
        'focus:bg-desk-edge focus:text-paper focus:font-ui focus:text-[14px]',
        'focus:outline-none',
      ].join(' ')}
    >
      Skip to main content
    </a>
  );
}
