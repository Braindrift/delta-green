/**
 * Defensive backstop for the sole-Handler "leave" trap (DEL-47).
 *
 * Reached when `leave_campaign` returns `is_handler` — the RPC refuses to
 * mutate when the caller's row has `role = 'gm'`. In v1 the landing-page
 * kebab only renders on player cards, so this dialog should be
 * unreachable through the As Agent menu. It exists for two cases:
 *
 *   1. Stale UI state — a concurrent transfer (M-7c / DEL-49) flipped
 *      the caller from player → gm between the page render and the
 *      action firing.
 *   2. A future surface that adds the leave action somewhere else
 *      (e.g., inside the campaign shell) without re-checking the role.
 *
 * The two real next steps — Transfer ownership (M-7c / DEL-49) and
 * Delete campaign (M-7b / DEL-48) — don't exist yet, so the buttons are
 * disabled with a "coming soon" tooltip, matching the Browse pattern on
 * the landing page header. When those flows land, the disabled buttons
 * become real links and this comment block can be trimmed.
 */

import { ModalShell } from '@/components/common/ModalShell';

export type LeaveLastHandlerModalProps = {
  campaignName: string;
  onClose: () => void;
};

export function LeaveLastHandlerModal({
  campaignName,
  onClose,
}: LeaveLastHandlerModalProps) {
  return (
    <ModalShell
      title="You're the only Handler"
      subtitle="A campaign can't be left without a Handler"
      onClose={onClose}
      width={480}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        You're the sole Handler of{' '}
        <span className="text-paper">{campaignName}</span>. Leaving would
        strand the agents and the case file.
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        Either{' '}
        <span className="text-paper-worn">transfer Handler duties</span> to
        another active member, or{' '}
        <span className="text-paper-worn">delete the campaign</span> if it's
        finished. Both options preserve the existing case notes.
      </p>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
            'text-green-mid border border-green-dim/60 bg-transparent',
            'transition-colors duration-150',
            'hover:text-paper hover:border-green-mid',
          ].join(' ')}
        >
          Close
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
            'text-green-mid border border-green-dim/60 bg-transparent',
            'cursor-not-allowed opacity-60',
          ].join(' ')}
        >
          Transfer Handler
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
            'cursor-not-allowed opacity-60',
          ].join(' ')}
        >
          Delete campaign
        </button>
      </div>
    </ModalShell>
  );
}
