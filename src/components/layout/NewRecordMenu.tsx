/**
 * The "+ NEW RECORD" dropdown.
 *
 * Driven entirely from the type registry (DEL-13). Every record type
 * defined in `recordTypeDefinitions` shows up here, in canonical order —
 * no SOON badges, no hardcoded list. When a new type is added to the
 * registry it appears here automatically.
 *
 * Per design doc §15 the registry starts empty for new GMs, so this is
 * the user's primary route to creating their first record.
 *
 * Click currently doesn't open a form panel — that's DEL-17. For now
 * `onSelect` is called and the layout logs to the console / can navigate;
 * the caller decides what to do.
 */

import { useEffect, useRef, useState } from 'react';

import { recordTypeDefinitions } from '@/lib/records/registry';
import type { RecordType } from '@/types/records';

export type NewRecordMenuProps = {
  /** Called with the chosen record type. Wiring lives in `AppLayout`. */
  onSelect: (type: RecordType) => void;
};

export function NewRecordMenu({ onSelect }: NewRecordMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape.
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="dg-toolbar-btn dg-toolbar-btn-primary font-ui text-[10px] tracking-[0.12em] uppercase px-[14px] py-[5px] cursor-pointer transition-all"
      >
        + NEW RECORD ▾
      </button>
      {open && (
        <div className="dg-new-record-dropdown absolute top-[calc(100%+6px)] right-0 min-w-[220px] z-[100] flex flex-col overflow-hidden border border-green-mid">
          <div className="font-display text-[7px] font-normal tracking-[0.35em] text-green-dim uppercase px-[14px] pt-2 pb-1 border-b border-green-dim">
            Select Record Type
          </div>
          {recordTypeDefinitions.map((def) => (
            <button
              type="button"
              key={def.type}
              onClick={() => {
                setOpen(false);
                onSelect(def.type);
              }}
              className="dg-dropdown-item flex items-center gap-[10px] px-[14px] py-[9px] cursor-pointer transition-colors text-left border-b border-green-accent/[0.06] last:border-b-0 bg-transparent"
            >
              <span className="font-ui text-[10px] tracking-[0.1em] text-paper-worn flex-1 uppercase">
                {def.displayName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
