/**
 * Confirmation modal for the Handler kick (DEL-44).
 *
 * Same visual shape as the player-initiated leave dialog (M-7a / DEL-47),
 * different copy and a different actor — that's why the component is
 * standalone rather than sharing a `LeaveModal` import: the leave flow
 * doesn't exist yet, and prematurely abstracting the two cases would
 * couple a not-yet-built UI to this one. When DEL-47 lands the two
 * components can converge if the shape stays identical.
 *
 * The actual mutation lives in `kickMember` from `@/lib/members`. This
 * component is purely the confirm UI — it surfaces a submitting state,
 * a generic error on failure, and calls `onConfirmed` once the row
 * flips to `former` so the parent can refresh its lists.
 */

import { useState } from 'react';

import { kickMember } from '@/lib/members';
import { ModalShell } from './ModalShell';

export type KickConfirmModalProps = {
  memberId: string;
  /** Display handle for the target — shown in the confirmation copy. */
  memberLabel: string;
  onClose: () => void;
  onConfirmed: () => void;
};

export function KickConfirmModal({
  memberId,
  memberLabel,
  onClose,
  onConfirmed,
}: KickConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await kickMember(memberId);
    setSubmitting(false);

    if (!result.ok) {
      setError('Could not remove this agent. Try again.');
      return;
    }
    onConfirmed();
  }

  return (
    <ModalShell
      title="Remove from campaign"
      subtitle="Permanent action — preserves history"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        Remove <span className="text-paper">{memberLabel}</span> from this campaign?
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        They lose access to records, sessions, and notes immediately. Their attached
        player character — if any — will be marked as former but kept on file.
      </p>

      {error ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Action failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {error}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
            'text-green-mid border border-green-dim/60 bg-transparent',
            'transition-colors duration-150',
            'hover:text-paper hover:border-green-mid',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
            'cursor-pointer transition-all duration-150',
            'hover:bg-red-faded/[0.16] hover:shadow-[0_0_12px_rgba(170,80,80,0.18)]',
            'focus:outline-none focus:border-red-stamp',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            'flex items-center gap-2',
          ].join(' ')}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-red-stamp dg-status-dot"
              />
              Removing…
            </>
          ) : (
            'Remove'
          )}
        </button>
      </div>
    </ModalShell>
  );
}
