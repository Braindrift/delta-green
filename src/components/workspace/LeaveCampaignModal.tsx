/**
 * Confirmation modal for the player-initiated leave-campaign flow (DEL-47).
 *
 * Surface: the kebab menu on a player campaign card on the workspace
 * landing page. The dialog matches the wireframe's `LeaveModal`:
 *   - explanatory copy ("You'll leave X. Your agent and case notes stay…"),
 *   - a "Type LEAVE to confirm" gate on the destructive button,
 *   - a destructive "Leave campaign" CTA next to a Cancel.
 *
 * The actual mutation is `leaveCampaign` (`@/lib/members`), which calls
 * the `leave_campaign` RPC. The RPC's `is_handler` discriminator is
 * surfaced to the parent via `onIsHandler` so the landing page can swap
 * this dialog for `LeaveLastHandlerModal`. That path is defensive — the
 * landing page only renders the kebab on `role = 'player'` cards, so the
 * Handler trap should be unreachable from the UI in v1 — but if it ever
 * fires (stale UI after a post-transfer race, or a future surface that
 * adds the action elsewhere), the user sees the right next-step instead
 * of a generic error.
 *
 * Shape mirrors `KickConfirmModal`. The two components live separately
 * because the copy and the gate behaviour differ — keeping them apart
 * makes both call sites readable.
 */

import { useState } from 'react';

import { ModalShell } from '@/components/manage/ModalShell';
import { leaveCampaign } from '@/lib/members';

const CONFIRM_PHRASE = 'LEAVE';

export type LeaveCampaignModalProps = {
  campaignId: string;
  /** Display name for the campaign — shown in the confirmation copy. */
  campaignName: string;
  onClose: () => void;
  /** Fired after the leave succeeds. Parent refetches memberships. */
  onLeft: () => void;
  /**
   * Fired when the RPC returns `is_handler`. Parent should close this
   * dialog and open `LeaveLastHandlerModal`. Defensive backstop; not
   * reachable through the As Agent menu in v1.
   */
  onIsHandler: () => void;
};

export function LeaveCampaignModal({
  campaignId,
  campaignName,
  onClose,
  onLeft,
  onIsHandler,
}: LeaveCampaignModalProps) {
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = phrase.trim().toUpperCase() === CONFIRM_PHRASE;

  async function handleConfirm() {
    if (submitting || !confirmed) return;
    setSubmitting(true);
    setError(null);

    const result = await leaveCampaign(campaignId);
    setSubmitting(false);

    if (!result.ok) {
      setError('Could not leave the campaign. Try again.');
      return;
    }

    if (result.data === 'is_handler') {
      onIsHandler();
      return;
    }

    if (result.data === 'not_member') {
      // Stale UI state — the parent's refetch will drop this card from
      // the list anyway. Treat as success from the caller's perspective.
      onLeft();
      return;
    }

    onLeft();
  }

  return (
    <ModalShell
      title="Leave campaign"
      subtitle="Permanent action — keeps your agent on file"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        You'll leave <span className="text-paper">{campaignName}</span>. Your
        agent and case notes stay with the campaign for the Handler's records,
        but you lose access to operations, sessions, and entities immediately.
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        Rejoining later requires a fresh invite from the Handler.
      </p>

      <label
        htmlFor="leave-confirm"
        className="block font-ui text-[10px] tracking-[0.18em] uppercase text-green-bright mb-2"
      >
        Type <span className="text-paper">{CONFIRM_PHRASE}</span> to confirm
      </label>
      <input
        id="leave-confirm"
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        disabled={submitting}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className={[
          'w-full font-body text-[13px] text-paper bg-desk-groove',
          'border border-green-dim px-3 py-[8px] tracking-[0.16em] uppercase',
          'focus:outline-none focus:border-green-mid focus:bg-green-void',
          'transition-colors duration-150 mb-5',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        ].join(' ')}
      />

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
          disabled={submitting || !confirmed}
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
              Leaving…
            </>
          ) : (
            'Leave campaign'
          )}
        </button>
      </div>
    </ModalShell>
  );
}
