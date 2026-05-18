/**
 * Campaign Settings screen.
 *
 * Lives at `/campaigns/:campaignId/manage/settings`, gated by `ManageGuard`
 * so only the active Handler can land here. Sections in render order:
 *
 *   1. Handler transfer (DEL-49) — hand the campaign to another active
 *      member. Renders either the "Transfer ownership" button or, when a
 *      pending transfer exists, a banner naming the recipient with a
 *      cancel control.
 *   2. Danger zone (DEL-48) — soft-delete the campaign.
 *
 * The page is structured as a vertical stack so future sections (rename in
 * M-7a, etc.) are additive — no restructure required.
 *
 * Side effects on success:
 *
 *   - Transfer issued → toast, reload pending state. The recipient is now
 *     able to act via `/transfers/:transferId`.
 *   - Transfer cancelled → toast, reload pending state. No notification
 *     fires (intentional per migration header).
 *   - Delete succeeds → DEL-35 trigger fans `campaign_deleted` to every
 *     other member; RLS hides the campaign immediately, including from the
 *     Handler — we toast and `navigate('/')` so the page doesn't render
 *     against a stale context.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteCampaignModal } from '@/components/manage/DeleteCampaignModal';
import { TransferHandlerModal } from '@/components/manage/TransferHandlerModal';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import {
  cancelTransfer,
  getPendingTransferForCampaign,
} from '@/lib/transfers';
import type { PendingTransferForSender } from '@/types/transfers';

type DialogState = { kind: 'closed' } | { kind: 'delete' } | { kind: 'transfer' };

type PendingState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'idle'; pending: PendingTransferForSender | null };

export function ManageSettingsPage() {
  const { campaign } = useCurrentCampaign();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [pendingState, setPendingState] = useState<PendingState>({ kind: 'loading' });
  const [cancelling, setCancelling] = useState(false);

  // CampaignGuard guarantees a non-null campaign before this mounts, but
  // keep the access optional so a future refactor that moves the mount
  // point still type-checks.
  const campaignId = campaign?.id;
  const campaignName = campaign?.name ?? '';

  const reloadPending = useCallback(async () => {
    if (!campaignId) return;
    setPendingState({ kind: 'loading' });
    const result = await getPendingTransferForCampaign(campaignId);
    if (!result.ok) {
      setPendingState({ kind: 'error' });
      return;
    }
    setPendingState({ kind: 'idle', pending: result.data });
  }, [campaignId]);

  useEffect(() => {
    // Deferred via a microtask so the synchronous `setState({ kind: 'loading' })`
    // inside `reloadPending` lands on a separate tick from the effect body —
    // mirrors the pattern used in `ManageMembersPage` / `CampaignContext`.
    void Promise.resolve().then(() => reloadPending());
  }, [reloadPending]);

  async function handleCancel() {
    if (
      cancelling ||
      pendingState.kind !== 'idle' ||
      pendingState.pending === null
    ) {
      return;
    }
    setCancelling(true);
    const result = await cancelTransfer(pendingState.pending.id);
    setCancelling(false);
    if (!result.ok) {
      showToast('error', 'Could not cancel the transfer. Try again.');
      return;
    }
    showToast('success', 'Transfer cancelled.');
    void reloadPending();
  }

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Settings
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Campaign-level controls
        </p>
      </header>

      <div className="flex flex-col gap-8">
        <HandlerTransferSection
          state={pendingState}
          disabled={!campaignId}
          cancelling={cancelling}
          onTransferRequest={() => setDialog({ kind: 'transfer' })}
          onCancel={() => void handleCancel()}
        />

        <DangerZone
          disabled={!campaignId}
          onDeleteRequest={() => setDialog({ kind: 'delete' })}
        />
      </div>

      {dialog.kind === 'transfer' && campaignId ? (
        <TransferHandlerModal
          campaignId={campaignId}
          campaignName={campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
          onIssued={(handle) => {
            setDialog({ kind: 'closed' });
            showToast('success', `Transfer sent to ${handle}.`);
            void reloadPending();
          }}
        />
      ) : null}

      {dialog.kind === 'delete' && campaignId ? (
        <DeleteCampaignModal
          campaignId={campaignId}
          campaignName={campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
          onDeleted={() => {
            setDialog({ kind: 'closed' });
            showToast('success', `${campaignName} deleted.`);
            navigate('/', { replace: true });
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Handler transfer                                                          */
/* -------------------------------------------------------------------------- */

function HandlerTransferSection({
  state,
  disabled,
  cancelling,
  onTransferRequest,
  onCancel,
}: {
  state: PendingState;
  disabled: boolean;
  cancelling: boolean;
  onTransferRequest: () => void;
  onCancel: () => void;
}) {
  const pending = state.kind === 'idle' ? state.pending : null;

  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        Handler transfer
      </h2>
      <div className="border border-green-dim bg-desk-edge px-5 py-4">
        {pending ? (
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-ui text-[12px] tracking-[0.06em] text-paper mb-1">
                Pending transfer to{' '}
                <span className="text-green-accent">
                  {pending.to_username ?? 'agent'}
                </span>
              </div>
              <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed max-w-xl">
                Sent {formatShortDate(pending.created_at)}. They'll see the
                request in their notifications. Cancel here if you change your
                mind — they'll lose access to accept.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className={[
                'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
                'text-paper-worn border border-green-dim/60 bg-transparent',
                'cursor-pointer transition-colors duration-150',
                'hover:text-paper hover:border-green-mid',
                'disabled:cursor-not-allowed disabled:opacity-60',
                'flex-shrink-0',
              ].join(' ')}
            >
              {cancelling ? 'Cancelling…' : 'Cancel transfer'}
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-ui text-[12px] tracking-[0.06em] text-paper mb-1">
                Transfer ownership
              </div>
              <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed max-w-xl">
                Hand this campaign to another active member. They have to
                accept before anything changes. Once they do, you become a
                player.
              </p>
              {state.kind === 'error' ? (
                <p className="font-ui text-[10px] tracking-[0.12em] uppercase text-red-stamp mt-2">
                  Could not check pending transfers.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onTransferRequest}
              disabled={disabled || state.kind === 'loading'}
              className={[
                'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
                'text-green-accent border border-green-mid bg-green-accent/[0.06]',
                'cursor-pointer transition-all duration-150',
                'hover:bg-green-accent/[0.12] hover:border-green-bright',
                'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
                'focus:outline-none focus:border-green-bright',
                'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
                'flex-shrink-0',
              ].join(' ')}
            >
              Transfer ownership
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Danger zone                                                               */
/* -------------------------------------------------------------------------- */

function DangerZone({
  disabled,
  onDeleteRequest,
}: {
  disabled: boolean;
  onDeleteRequest: () => void;
}) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-red-stamp mb-3">
        Danger zone
      </h2>
      <div className="border border-red-faded/60 bg-red-faded/[0.04] px-5 py-4 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-ui text-[12px] tracking-[0.06em] text-paper mb-1">
            Delete this campaign
          </div>
          <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed max-w-xl">
            All active members are notified and immediately lose access.
            Operations, sessions, and entity records remain on file but are no
            longer reachable from the app.
          </p>
        </div>
        <button
          type="button"
          onClick={onDeleteRequest}
          disabled={disabled}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
            'cursor-pointer transition-all duration-150',
            'hover:bg-red-faded/[0.16] hover:shadow-[0_0_12px_rgba(170,80,80,0.18)]',
            'focus:outline-none focus:border-red-stamp',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            'flex-shrink-0',
          ].join(' ')}
        >
          Delete campaign
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
