/**
 * The application header strip — decorative, no interactivity.
 *
 * Per design doc §4.1: DG seal, program title, classification badge,
 * "SECURE CONNECTION" status dot with a pulsing animation. Fixed 54px
 * (`h-[54px]`), static across every authenticated view.
 *
 * Visual elements that needed CSS that Tailwind utilities can't express
 * cleanly (the gradient underline, the radial-gradient inside the seal,
 * the keyframed pulse) live in `index.css` under `@layer components`.
 */

export function Header() {
  return (
    <header className="dg-header relative z-10 h-[54px] flex items-center gap-5 px-6 flex-shrink-0 border-b border-green-dim">
      {/* DG seal */}
      <div className="dg-header-seal w-9 h-9 rounded-full border border-green-mid flex items-center justify-center font-display text-[11px] font-semibold text-green-accent flex-shrink-0 relative">
        DG
      </div>

      {/* Title */}
      <div className="font-display font-light text-[15px] tracking-[0.3em] text-paper-worn uppercase">
        <strong className="font-semibold text-green-accent dg-title-glow">DELTA GREEN</strong>
        {' // '}
        CASE FILE REGISTRY
      </div>

      {/* Vertical divider */}
      <div className="w-px h-5 dg-header-divider mx-1" />

      {/* Program meta */}
      <div className="font-ui text-[10px] text-green-bright tracking-[0.12em]">
        PROGRAM: ACTIVE &nbsp;|&nbsp; CLEARANCE: EYES ONLY
      </div>

      <div className="ml-auto flex items-center gap-[18px]">
        {/* Classification badge — typewriter-style stamp, slight rotation */}
        <div className="dg-classification-badge font-stamp text-xs tracking-[0.15em] text-red-stamp border border-red-faded px-[10px] py-[3px] relative">
          TOP SECRET
        </div>

        {/* Secure connection status */}
        <div className="font-ui text-[10px] text-green-bright tracking-[0.1em] flex items-center">
          <span className="dg-status-dot inline-block w-[5px] h-[5px] rounded-full bg-green-accent mr-[7px]" />
          SECURE CONNECTION
        </div>
      </div>
    </header>
  );
}
