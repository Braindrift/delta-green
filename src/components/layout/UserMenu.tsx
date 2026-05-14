/**
 * Toolbar user menu — replaces the `TempAuthBar` strip that was sitting
 * above the theme-test home page in `App.tsx`.
 *
 * Shows the signed-in email, opens a small dropdown with a Sign Out item.
 * Per design doc §4.3 the user menu lives in the right-hand toolbar
 * cluster alongside Export/Import and "+ NEW RECORD".
 */

import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
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
  }, [open]);

  if (!user) return null;

  // Show the part of the email before `@` if it's short, otherwise the
  // full thing. Either way it's clipped by the dropdown's narrow target.
  const handle = user.email ?? 'agent';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="dg-toolbar-btn font-ui text-[10px] tracking-[0.12em] uppercase px-[14px] py-[5px] cursor-pointer transition-all flex items-center gap-2"
      >
        <span className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent" />
        <span className="truncate max-w-[180px]">{handle}</span>
        <span className="text-green-mid">▾</span>
      </button>
      {open && (
        <div className="dg-new-record-dropdown absolute top-[calc(100%+6px)] right-0 min-w-[200px] z-[100] flex flex-col overflow-hidden border border-green-mid">
          <div className="font-display text-[7px] font-normal tracking-[0.35em] text-green-dim uppercase px-[14px] pt-2 pb-1 border-b border-green-dim">
            Signed In
          </div>
          <div className="font-ui text-[10px] tracking-[0.08em] text-paper-worn px-[14px] py-2 border-b border-green-accent/[0.06] truncate">
            {user.email}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="dg-dropdown-item flex items-center px-[14px] py-[9px] cursor-pointer transition-colors text-left bg-transparent border-0"
          >
            <span className="font-ui text-[10px] tracking-[0.1em] text-paper-worn flex-1 uppercase">
              Sign Out
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
