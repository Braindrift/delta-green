/**
 * Shared placeholder components used by every per-type registry module
 * until the form/card/list-item content is implemented per type by
 * <issue id="DEL-19">DEL-19</issue> through <issue id="DEL-22">DEL-22</issue>.
 *
 * These are NOT meant to look polished. They use the Delta Green design
 * tokens (paper/ink/amber, font-stamp for the "not implemented" callout)
 * so they don't clash with the surrounding chrome, but they're explicitly
 * labelled as placeholders so nobody mistakes them for working UI.
 *
 * Each placeholder also names the ticket that will replace it, so a future
 * reader (likely future-me) lands on the right ticket without having to
 * trace the dependency graph.
 *
 * The exported `make*` functions are component-factory HOCs: they return
 * components bound to a specific `RecordType`. The React-Refresh lint
 * rule can't statically recognise this pattern (factory-returns-component
 * looks identical to factory-returns-anything from its perspective), so
 * the rule is disabled for this file. Fast Refresh isn't meaningful here
 * anyway — these components are placeholders, set to be replaced wholesale
 * by DEL-19+.
 */
/* eslint-disable react-refresh/only-export-components */

import type { JSX } from 'react';

import type { RecordType } from '@/types/records';

import { IMPL_TICKET } from './_impl-tickets';
import type { RecordCardProps, RecordFormProps, RecordListItemProps } from './types';

/* -------------------------------------------------------------------------- */
/*  Internal: visual shell                                                    */
/* -------------------------------------------------------------------------- */

function PlaceholderShell({
  slot,
  type,
  detail,
}: {
  slot: 'form' | 'card' | 'list item';
  type: RecordType;
  detail?: string;
}): JSX.Element {
  const ticket = IMPL_TICKET[type];
  return (
    <div className="rounded border border-amber-dim/40 bg-paper-dark/30 px-4 py-3 text-ink-faded">
      <div className="font-stamp text-amber text-xs uppercase tracking-widest">
        {type} {slot} — not yet implemented
      </div>
      <div className="font-ui text-[11px] mt-1 text-ink-faded/80">
        Will be implemented in <span className="text-amber-dim">{ticket}</span>.
        {detail ? <span className="ml-1">{detail}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Slot factories                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Build a placeholder form component bound to a specific record type.
 * Per-type modules call this rather than re-defining the placeholder body.
 *
 * The returned component intentionally ignores `onChange` — there's nothing
 * to edit yet. When the real form lands it will wire up properly.
 */
export function makePlaceholderForm<T extends RecordType>(type: T) {
  function PlaceholderForm({ record }: RecordFormProps<T>): JSX.Element {
    const detail = record.name ? `Editing "${record.name}".` : 'New record.';
    return <PlaceholderShell slot="form" type={type} detail={detail} />;
  }
  PlaceholderForm.displayName = `PlaceholderForm(${type})`;
  return PlaceholderForm;
}

/**
 * Build a placeholder card component bound to a specific record type.
 */
export function makePlaceholderCard<T extends RecordType>(type: T) {
  function PlaceholderCard({ record }: RecordCardProps<T>): JSX.Element {
    return (
      <PlaceholderShell
        slot="card"
        type={type}
        detail={`Record: ${record.name || '(unnamed)'} — ${record.id}.`}
      />
    );
  }
  PlaceholderCard.displayName = `PlaceholderCard(${type})`;
  return PlaceholderCard;
}

/**
 * Build a placeholder list-item component bound to a specific record type.
 *
 * Uses a more compact, single-line shape so it doesn't blow up vertical
 * space in lists. Still clearly marked as a placeholder.
 */
export function makePlaceholderListItem<T extends RecordType>(type: T) {
  function PlaceholderListItem({ record, isSelected }: RecordListItemProps<T>): JSX.Element {
    const ticket = IMPL_TICKET[type];
    return (
      <div
        className={[
          'flex items-center gap-3 border-l-2 px-3 py-2 font-ui text-[11px]',
          isSelected
            ? 'border-amber bg-paper-dark/40 text-ink'
            : 'border-amber-dim/40 bg-paper-dark/20 text-ink-faded',
        ].join(' ')}
      >
        <span className="font-stamp uppercase tracking-wider text-amber-dim">{type}</span>
        <span className="flex-1 truncate">{record.name || '(unnamed)'}</span>
        <span className="text-ink-faded/60">placeholder · {ticket}</span>
      </div>
    );
  }
  PlaceholderListItem.displayName = `PlaceholderListItem(${type})`;
  return PlaceholderListItem;
}
