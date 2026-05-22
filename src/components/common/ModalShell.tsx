/**
 * Generic modal chrome shared by the Members-screen dialogs (DEL-44).
 *
 * Renders a centred dialog over a translucent backdrop. The shell is
 * intentionally light: the close button + click-outside + Escape are
 * the only built-in behaviours. Heading, body, and footer are passed
 * in as children so each caller controls its own copy and CTAs.
 *
 * Why not a portal: the workspace shell scrolls inside a fixed-height
 * column, but the dialog itself uses `position: fixed`, so it's not
 * clipped by the parent scroll region. A portal would add a dependency
 * (no existing portal root in the app) for no visual benefit.
 *
 * Focus is moved into the dialog on mount via an inner ref. Escape and
 * outside-pointerdown both call `onClose`, mirroring `UserMenu`'s
 * dropdown pattern but on a full-screen scope. A `preventClose` knob
 * lets callers temporarily disable the close paths while a mutation is
 * in flight — closing mid-write would leave the UI inconsistent.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export type ModalShellProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /**
   * When true, the Escape key and backdrop click are ignored. The close
   * button is also disabled. Used by callers that want to block dismissal
   * during a submit.
   */
  preventClose?: boolean;
  /**
   * When false, the shell offers no chrome-level dismissal: the × button is
   * hidden, Escape is ignored, and backdrop clicks do nothing. Used by
   * modals that want a single explicit close path inside the body (e.g.
   * the Invite Players modal's BACK button). Defaults to true.
   */
  closeOnChrome?: boolean;
  /**
   * Width in pixels. Defaults to 520. The Invite modal needs a bit more
   * room than the Kick confirm.
   */
  width?: number;
  children: ReactNode;
};

export function ModalShell({
  title,
  subtitle,
  onClose,
  preventClose = false,
  closeOnChrome = true,
  width = 520,
  children,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Move focus into the dialog on mount so keyboard users land inside the
  // dialog instead of behind the backdrop. The `tabIndex={-1}` on the
  // container makes it a valid focus target without joining the tab order.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (preventClose || !closeOnChrome) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, preventClose, closeOnChrome]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-desk/80 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        if (preventClose || !closeOnChrome) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dg-modal-title"
        tabIndex={-1}
        className="border border-green-mid bg-desk-edge shadow-[0_0_20px_rgba(0,0,0,0.4)] outline-none"
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-green-dim px-6 py-4">
          <div className="min-w-0">
            <h2
              id="dg-modal-title"
              className="font-display text-[16px] tracking-[0.18em] uppercase text-paper"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-1">
                {subtitle}
              </p>
            ) : null}
          </div>
          {closeOnChrome ? (
            <button
              type="button"
              onClick={onClose}
              disabled={preventClose}
              aria-label="Close"
              className={[
                'font-ui text-[18px] leading-none text-paper-dark transition-colors',
                'hover:text-paper disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
