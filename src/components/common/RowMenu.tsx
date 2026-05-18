/**
 * Kebab (⋯) menu used by row-style and card-style affordances.
 *
 * Originally lived inline in `ManageMembersPage` for the per-member
 * "Remove from campaign" action (DEL-44). DEL-47 added a second caller —
 * the `CampaignsLandingPage` campaign card uses the same kebab for player
 * memberships' "Leave campaign" action — so the menu was lifted here.
 *
 * Behaviour notes:
 *   - Outside-pointerdown and Escape both close the menu, mirroring the
 *     `UserMenu` dropdown pattern.
 *   - The render-prop child receives a `close` callback so menu items can
 *     dismiss the menu before firing their action; this matters when the
 *     action opens a modal — without the explicit close, the menu stays
 *     stuck open behind the dialog and re-opens visually when the dialog
 *     closes.
 *   - The trigger uses `border-transparent` so the kebab only gains a
 *     visible chrome on hover. Consumers that need a different placement
 *     should wrap this component rather than fork it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export type RowMenuProps = {
  /** Accessible label for the kebab button. Should be specific to the row. */
  label: string;
  children: (close: () => void) => ReactNode;
};

export function RowMenu({ label, children }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useMenuOutsideClose(setOpen, open);

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'font-ui text-[14px] leading-none text-paper-dark hover:text-paper',
          'border border-transparent hover:border-green-dim/60',
          'w-[28px] h-[24px] flex items-center justify-center transition-colors',
        ].join(' ')}
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 min-w-[200px] z-[50] flex flex-col overflow-hidden border border-green-mid bg-desk-edge"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function useMenuOutsideClose(setOpen: (v: boolean) => void, open: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}
