/**
 * Confirmation modal for the Handler-initiated campaign-delete flow (DEL-48).
 *
 * Opened from the kebab on a Handler campaign card on the workspace landing
 * page.
 *
 * On confirm, `softDeleteCampaign` flips `campaigns.deleted_at` to `now()`.
 * The DEL-35 `campaigns_notify_soft_delete` trigger fires inside the same
 * transaction and inserts a `campaign_deleted` notification for every member
 * except the caller. RLS on `campaigns` reads (`deleted_at is null`) drops the
 * campaign from every other surface immediately — the Handler's own ability
 * to read the row also disappears, which is why the parent must redirect
 * away from any campaign-scoped route after success.
 *
 * The shape mirrors `LeaveCampaignModal`: type-the-word gate, destructive
 * button, inline error rendering. The two dialogs are kept separate because
 * the copy differs and the gate phrase differs — collapsing them into a
 * generic "destructive confirm" component would either need a copy slot per
 * variant or sacrifice the typed action contract on success.
 */

import { useState } from 'react';

import { ModalShell } from '@/components/common/ModalShell';
import { softDeleteCampaign } from '@/lib/campaigns';

const CONFIRM_PHRASE = 'DELETE';

export type DeleteCampaignModalProps = {
  campaignId: string;
  /** Display name for the campaign — shown in the confirmation copy. */
  campaignName: string;
  onClose: () => void;
  /** Fired after the soft-delete succeeds. Parent toasts + navigates. */
  onDeleted: () => void;
};

export function DeleteCampaignModal({
  campaignId,
  campaignName,
  onClose,
  onDeleted,
}: DeleteCampaignModalProps) {
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = phrase.trim().toUpperCase() === CONFIRM_PHRASE;

  async function handleConfirm() {
    if (submitting || !confirmed) return;
    setSubmitting(true);
    setError(null);

    const result = await softDeleteCampaign(campaignId);
    setSubmitting(false);

    if (!result.ok) {
      setError('Could not delete the campaign. Try again.');
      return;
    }

    onDeleted();
  }

  return (
    <ModalShell
      title="Delete campaign"
      subtitle="Permanent — all members lose access"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        You're about to delete <span className="text-paper">{campaignName}</span>.
        All active members lose access immediately and are notified the
        campaign has been removed.
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        Operations, sessions, and entity records remain on file but are no
        longer reachable from the app. This cannot be undone from here.
      </p>

      <label
        htmlFor="delete-confirm"
        className="block font-ui text-[10px] tracking-[0.18em] uppercase text-green-bright mb-2"
      >
        Type <span className="text-paper">{CONFIRM_PHRASE}</span> to confirm
      </label>
      <input
        id="delete-confirm"
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
              Deleting…
            </>
          ) : (
            'Delete campaign'
          )}
        </button>
      </div>
    </ModalShell>
  );
}
