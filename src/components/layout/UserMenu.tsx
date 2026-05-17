/**
 * Header account dropdown — shows the signed-in email and a menu with
 * Profile, Account Settings, Preferences (placeholder routes), and Sign Out.
 *
 * Lives in the header so it's persistent across both the workspace shell
 * and the campaign shell (DEL-40).
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

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

  const handle = user.email ?? 'agent';

  const linkClass =
    'dg-dropdown-item flex items-center px-[14px] py-[9px] cursor-pointer transition-colors text-left font-ui text-[10px] tracking-[0.1em] text-paper-worn uppercase no-underline';

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
          <Link to="/profile" onClick={() => setOpen(false)} className={linkClass}>
            Profile
          </Link>
          <Link to="/account" onClick={() => setOpen(false)} className={linkClass}>
            Account Settings
          </Link>
          <Link to="/preferences" onClick={() => setOpen(false)} className={linkClass}>
            Preferences
          </Link>
          <div className="border-t border-green-dim/40" />
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
