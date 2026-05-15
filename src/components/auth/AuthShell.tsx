/**
 * Shared chrome for the public auth screens (login, signup, password
 * reset).
 *
 * Why a dedicated shell rather than reusing `AppLayout`:
 *
 *  - `AppLayout` assumes an authenticated session — its sidebar reads
 *    counts via the data layer and its toolbar contains the user menu.
 *    Pre-auth pages need none of that.
 *  - The visual brief from DEL-15 is "consistent with the main app", not
 *    "identical to it". A centred card on the desk-noise background gives
 *    us the same mood (DG seal, classification badge, monospace type)
 *    without dragging in the navigation chrome.
 *
 * Layout (per design doc §3, §4 — the same colour tokens and chrome
 * components as the authenticated shell):
 *
 *   <full-screen desk background>
 *     <thin header bar — DG seal, title, TOP SECRET badge>
 *     <centred card>
 *       <title + subtitle slot>
 *       <form slot — passed in as children>
 *       <footer link slot — "Already have an account?", etc.>
 *     </card>
 *     <footer micro-text>
 *   </full-screen>
 *
 * The card itself is a near-black panel with a `green-dim` border and a
 * subtle inset glow — flat-edged, no corner radius above 2px, per the
 * "Mood guarantees" in the design doc.
 */

import type { ReactNode } from 'react';

export type AuthShellProps = {
  /** The title under the DG seal — e.g. "AUTHENTICATE", "REQUEST ACCESS". */
  title: string;
  /** Short caption below the title. */
  subtitle: string;
  /** Form content (the form element and its fields). */
  children: ReactNode;
  /** Optional footer node — typically a link to another auth screen. */
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="dg-app-root min-h-screen w-screen bg-desk text-paper font-ui flex flex-col">
      {/* Header strip — visually rhymes with the authenticated header but
          strips out the per-session content. Decorative only. */}
      <header className="dg-header relative z-10 h-[54px] flex items-center gap-5 px-6 flex-shrink-0 border-b border-green-dim">
        <div className="dg-header-seal w-9 h-9 rounded-full border border-green-mid flex items-center justify-center font-display text-[11px] font-semibold text-green-accent flex-shrink-0 relative">
          DG
        </div>
        <div className="font-display font-light text-[15px] tracking-[0.3em] text-paper-worn uppercase">
          <strong className="font-semibold text-green-accent dg-title-glow">DELTA GREEN</strong>
          {' // '}
          CASE FILE REGISTRY
        </div>

        <div className="ml-auto flex items-center gap-[18px]">
          <div className="dg-classification-badge font-stamp text-xs tracking-[0.15em] text-red-stamp border border-red-faded px-[10px] py-[3px] relative">
            TOP SECRET
          </div>
        </div>
      </header>

      {/* Centred card. The flex-1 here makes the card vertically centre
          inside the remaining viewport — small forms float, longer forms
          (the signup with confirm + reset link) extend downward naturally. */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-[1]">
        <section className="dg-auth-card w-full max-w-[420px] border border-green-dim bg-desk-edge px-9 py-10 relative">
          {/* Top tag — small label that sits in the card's top-left
              corner, the same way the SECTION header carries one in the
              authenticated views. */}
          <div className="font-display text-[7px] font-normal tracking-[0.35em] text-green-dim uppercase mb-5">
            Restricted Access · DG-Auth
          </div>

          <h1 className="font-display text-[22px] font-light tracking-[0.22em] uppercase text-paper mb-1">
            {title}
          </h1>
          <p className="font-ui text-[10px] tracking-[0.16em] text-green-mid uppercase mb-7">
            {subtitle}
          </p>

          {children}

          {footer ? (
            <div className="mt-7 pt-5 border-t border-green-dim/60 font-ui text-[10px] tracking-[0.1em] text-paper-dark/70">
              {footer}
            </div>
          ) : null}
        </section>
      </main>

      {/* Footer micro-text — preserves the mood of the auth header strip
          without claiming a session-state element ("SECURE CONNECTION"
          would be a lie when nobody is signed in). */}
      <footer className="px-6 pb-4 font-ui text-[9px] tracking-[0.2em] text-green-mid/70 uppercase text-center">
        Eyes Only · This terminal is monitored
      </footer>
    </div>
  );
}
