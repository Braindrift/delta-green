/**
 * Handler ownership-transfer modal (DEL-49).
 *
 * Lives on the campaign Settings page. Loads the campaign's active
 * non-Handler members via `listActiveNonHandlerMembers`, lets the Handler
 * pick one, and on confirm inserts a `campaign_transfers` row with status
 * `pending`. The DEL-49 insert trigger fires the
 * `handler_transfer_requested` notification to the recipient inside the
 * same transaction; the recipient picks it up via the inbox (DEL-50) or
 * the `/transfers/:transferId` deep link.
 *
 * The modal is intentionally a one-step picker — no second "are you sure?"
 * confirm step. The Settings page already prefaces the affordance with an
 * explanation paragraph, and the transfer itself is recoverable: the
 * recipient can decline, and the Handler can cancel from the same
 * Settings page while the transfer is pending. A `LeaveCampaignModal`-style
 * type-the-word gate would be heavier than the action warrants.
 */

import { useEffect, useState } from 'react';

import { ModalShell } from './ModalShell';
import { listActiveNonHandlerMembers, createTransfer } from '@/lib/transfers';
import type { CampaignMemberWithProfile } from '@/types/members';

export type TransferHandlerModalProps = {
  campaignId: string;
  campaignName: string;
  onClose: () => void;
  /** Fired after the transfer row is inserted. Parent refreshes + toasts. */
  onIssued: (recipientHandle: string) => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; members: CampaignMemberWithProfile[] };

export function TransferHandlerModal({
  campaignId,
  campaignName,
  onClose,
  onIssued,
}: TransferHandlerModalProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listActiveNonHandlerMembers(campaignId);
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ready', members: result.data });
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  async function handleConfirm() {
    if (submitting || !selectedUserId) return;
    if (state.kind !== 'ready') return;

    setSubmitting(true);
    setSubmitError(null);

    const result = await createTransfer({
      campaignId,
      toUserId: selectedUserId,
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.kind === 'conflict') {
        // Partial unique fired — a pending transfer already exists for
        // this campaign. Surfaced here defensively; the Settings page
        // normally renders the pending banner instead of the trigger
        // button when this is the case, so this branch only fires on a
        // tight race between two Handler clients (rare).
        setSubmitError(
          'A transfer is already pending for this campaign. Cancel it first to issue a new one.',
        );
        return;
      }
      setSubmitError('Could not issue the transfer. Try again.');
      return;
    }

    const recipient = state.members.find(
      (m) => m.user_id === selectedUserId,
    );
    onIssued(recipient?.username ?? 'agent');
  }

  return (
    <ModalShell
      title="Transfer ownership"
      subtitle="Pick a recipient — they must accept"
      onClose={onClose}
      preventClose={submitting}
      width={520}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-4">
        You're handing <span className="text-paper">{campaignName}</span> to
        another active member. They'll receive a notification and become the
        Handler once they accept. You become a player.
      </p>

      {state.kind === 'loading' ? (
        <LoadingRow />
      ) : state.kind === 'error' ? (
        <ErrorRow />
      ) : state.members.length === 0 ? (
        <EmptyRow />
      ) : (
        <fieldset className="mb-5 border border-green-dim bg-desk-groove">
          <legend className="sr-only">Recipient</legend>
          <ul>
            {state.members.map((m) => {
              const handle = m.username ?? 'unknown agent';
              const isSelected = selectedUserId === m.user_id;
              return (
                <li
                  key={m.id}
                  className="border-b border-green-dim/40 last:border-b-0"
                >
                  <label
                    className={[
                      'flex items-center gap-3 px-4 py-3 cursor-pointer',
                      'transition-colors duration-150',
                      isSelected
                        ? 'bg-green-accent/[0.08]'
                        : 'hover:bg-green-accent/[0.04]',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="transfer-recipient"
                      value={m.user_id}
                      checked={isSelected}
                      onChange={() => setSelectedUserId(m.user_id)}
                      disabled={submitting}
                      className="accent-green-accent"
                    />
                    <span className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
                      {handle}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {submitError ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Action failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {submitError}
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
          disabled={
            submitting || state.kind !== 'ready' || selectedUserId === null
          }
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.08]',
            'cursor-pointer transition-all duration-150',
            'hover:bg-green-accent/[0.16] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
            'focus:outline-none focus:border-green-bright',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            'flex items-center gap-2',
          ].join(' ')}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
              />
              Issuing…
            </>
          ) : (
            'Send transfer'
          )}
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row variants                                                              */
/* -------------------------------------------------------------------------- */

function LoadingRow() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-4 py-3 mb-5">
      <div className="font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
        Loading roster…
      </div>
    </div>
  );
}

function ErrorRow() {
  return (
    <div className="border border-red-faded bg-red-faded/[0.08] px-4 py-3 mb-5">
      <div className="font-ui text-[11px] tracking-[0.12em] uppercase text-red-stamp">
        Could not load the roster.
      </div>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-4 py-3 mb-5">
      <div className="font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
        No eligible recipient. Invite or promote a member first.
      </div>
    </div>
  );
}
