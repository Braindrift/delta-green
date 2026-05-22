/**
 * Recipient-side accept screen for a Handler ownership transfer (DEL-49).
 *
 * Sits inside the workspace shell at `/transfers/:transferId`. Two entry
 * paths land here:
 *
 *   1. The notifications inbox (DEL-50, not yet built) — the
 *      `handler_transfer_requested` notification's payload carries
 *      `transfer_id`, and the inbox deep-links here. Passing
 *      `location.state.from = '/notifications'` routes decline back to the
 *      inbox.
 *   2. Manual URL paste / future toast shortcut.
 *
 * Flow shape — mirror of `InviteAcceptPage` but slimmer:
 *
 *   - Load the transfer row + campaign name + sender handle
 *     (`getTransferForRecipient`). If the row is non-pending or its
 *     campaign is gone, render the matching terminal card.
 *   - Accept → `acceptTransfer` (RPC). On `accepted`, toast and navigate
 *     to `/` — the recipient is now the Handler and the campaign appears
 *     in their Handler group on the workspace landing page. On `gone` /
 *     `deleted`, swap to the matching terminal card without a refetch. On
 *     `not_recipient`, refetch (defensive — shouldn't be reachable through
 *     normal navigation).
 *   - Decline → `declineTransfer` (plain UPDATE under recipient RLS).
 *     The DEL-49 status-change trigger notifies the sender. Route back
 *     to `location.state.from ?? '/'`.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useToast } from '@/contexts/ToastContext';
import {
  acceptTransfer,
  declineTransfer,
  getTransferForRecipient,
} from '@/lib/transfers';
import type { TransferAcceptView } from '@/types/transfers';

/**
 * Terminal states the screen renders when the transfer isn't live. The
 * names line up 1:1 with the non-`pending` statuses on
 * `campaign_transfers`, plus `deleted` for a soft-deleted campaign and
 * `not_found` for an id the caller can't see.
 */
type TerminalVariant =
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'deleted'
  | 'not_found';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'terminal'; variant: TerminalVariant; campaignName: string | null }
  | { kind: 'ready'; transfer: TransferAcceptView };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'accepting' }
  | { kind: 'declining' }
  | { kind: 'error'; message: string };

type LocationState = { from?: string } | null;

export function TransferAcceptPage() {
  const { transferId } = useParams<{ transferId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const fallback = ((location.state as LocationState)?.from ?? '/') || '/';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!transferId) {
      setState({ kind: 'terminal', variant: 'not_found', campaignName: null });
      return;
    }
    setState({ kind: 'loading' });

    const result = await getTransferForRecipient(transferId);
    if (!result.ok) {
      if (result.kind === 'not_found') {
        setState({ kind: 'terminal', variant: 'not_found', campaignName: null });
        return;
      }
      setState({ kind: 'error' });
      return;
    }

    const transfer = result.data;
    // `campaign_name` is empty when the campaign is gone (deleted or RLS-hidden).
    if (!transfer.campaign_name) {
      setState({
        kind: 'terminal',
        variant: 'deleted',
        campaignName: null,
      });
      return;
    }

    if (transfer.status !== 'pending') {
      // 1:1 mapping to the terminal-variant union.
      setState({
        kind: 'terminal',
        variant: transfer.status,
        campaignName: transfer.campaign_name,
      });
      return;
    }

    setState({ kind: 'ready', transfer });
  }, [transferId]);

  useEffect(() => {
    // Match the InviteAcceptPage pattern — defer the in-effect setState so
    // it lands on a separate tick from the effect body.
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleAccept() {
    if (
      state.kind !== 'ready' ||
      submit.kind === 'accepting' ||
      submit.kind === 'declining'
    ) {
      return;
    }

    setSubmit({ kind: 'accepting' });
    const result = await acceptTransfer(state.transfer.id);

    if (!result.ok) {
      setSubmit({
        kind: 'error',
        message: 'Could not accept the transfer. Try again.',
      });
      return;
    }

    if (result.data === 'accepted') {
      showToast('success', 'You are the new Handler.');
      navigate('/', { replace: true });
      return;
    }

    setSubmit({ kind: 'idle' });
    if (result.data === 'not_recipient') {
      // Defensive — shouldn't happen on a link delivered to the recipient.
      // Refetch so the row's current state surfaces.
      void load();
      return;
    }
    // `gone` / `deleted` both route to a terminal card. For `gone` we
    // refetch so the right variant (cancelled / declined / accepted) shows;
    // for `deleted` we flip immediately.
    if (result.data === 'deleted') {
      setState({
        kind: 'terminal',
        variant: 'deleted',
        campaignName: state.transfer.campaign_name,
      });
      return;
    }
    void load();
  }

  async function handleDecline() {
    if (
      state.kind !== 'ready' ||
      submit.kind === 'accepting' ||
      submit.kind === 'declining'
    ) {
      return;
    }

    setSubmit({ kind: 'declining' });
    const result = await declineTransfer(state.transfer.id);

    if (!result.ok) {
      // `not_found` here means the row was visible at load but the
      // pending-status guard in the UPDATE matched zero rows — i.e. a
      // concurrent cancel/accept. Refetch to surface the current state.
      if (result.kind === 'not_found') {
        setSubmit({ kind: 'idle' });
        void load();
        return;
      }
      setSubmit({
        kind: 'error',
        message: 'Could not decline the transfer. Try again.',
      });
      return;
    }

    showToast('info', 'Transfer declined.');
    navigate(fallback, { replace: true });
  }

  if (state.kind === 'loading') {
    return <CenteredCard tone="notice" title="Decrypting" body="Loading transfer…" />;
  }
  if (state.kind === 'error') {
    return (
      <CenteredCard
        tone="error"
        title="Transmission failed"
        body="Could not load the transfer. Try again."
        action={{ label: 'Retry', onClick: () => void load() }}
      />
    );
  }
  if (state.kind === 'terminal') {
    return (
      <TerminalCard
        variant={state.variant}
        campaignName={state.campaignName}
        onHome={() => navigate('/', { replace: true })}
      />
    );
  }

  const { transfer } = state;
  const busy = submit.kind === 'accepting' || submit.kind === 'declining';

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Handler transfer
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Confirm change of command
        </p>
      </header>

      <div className="flex flex-col gap-6 max-w-2xl">
        <div className="border border-green-dim bg-desk-edge px-5 py-4">
          <div className="font-display text-[22px] tracking-[0.14em] uppercase text-paper">
            {transfer.campaign_name}
          </div>
          <p className="font-ui text-[12px] tracking-[0.06em] text-paper-worn mt-2 leading-relaxed">
            <span className="text-paper">
              {transfer.from_username ?? 'The Handler'}
            </span>{' '}
            wants to transfer Handler duties on this campaign to you.
          </p>
          <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 mt-2 leading-relaxed">
            Accepting makes you the new Handler. The current Handler becomes a
            player and keeps their seat. Declining leaves things as they are
            and lets them know.
          </p>
        </div>

        {submit.kind === 'error' ? (
          <div
            role="alert"
            className="border border-red-faded bg-red-faded/[0.08] px-3 py-2"
          >
            <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
              Action failed
            </div>
            <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
              {submit.message}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleDecline}
            disabled={busy}
            className={declineButtonClass}
          >
            {submit.kind === 'declining' ? (
              <>
                <Spinner tone="red" />
                Declining…
              </>
            ) : (
              'Decline'
            )}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className={acceptButtonClass}
          >
            {submit.kind === 'accepting' ? (
              <>
                <Spinner tone="green" />
                Accepting…
              </>
            ) : (
              'Accept transfer'
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Terminal card                                                             */
/* -------------------------------------------------------------------------- */

function TerminalCard({
  variant,
  campaignName,
  onHome,
}: {
  variant: TerminalVariant;
  campaignName: string | null;
  onHome: () => void;
}) {
  const copy = terminalCopy(variant, campaignName);
  return (
    <CenteredCard
      tone={copy.tone}
      title={copy.title}
      body={copy.body}
      action={{ label: 'Back to campaigns', onClick: onHome }}
    />
  );
}

function terminalCopy(
  variant: TerminalVariant,
  campaignName: string | null,
): { tone: 'notice' | 'error'; title: string; body: string } {
  const target = campaignName ? `for ${campaignName}` : '';
  switch (variant) {
    case 'accepted':
      return {
        tone: 'notice',
        title: 'Already accepted',
        body: `This transfer ${target} has already been accepted.`.trim(),
      };
    case 'declined':
      return {
        tone: 'notice',
        title: 'Already declined',
        body: `You already declined this transfer ${target}.`.trim(),
      };
    case 'cancelled':
      return {
        tone: 'notice',
        title: 'Transfer cancelled',
        body: `The Handler cancelled this transfer ${target} before you could act.`.trim(),
      };
    case 'deleted':
      return {
        tone: 'error',
        title: 'Campaign unavailable',
        body: 'The campaign has been deleted or is no longer accessible.',
      };
    case 'not_found':
    default:
      return {
        tone: 'error',
        title: 'Unknown transfer',
        body: 'This transfer could not be found.',
      };
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function CenteredCard({
  tone,
  title,
  body,
  action,
}: {
  tone: 'notice' | 'error';
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  const stampColor = tone === 'error' ? 'text-red-stamp' : 'text-amber-dim';
  const border = tone === 'error' ? 'border-red-faded' : 'border-green-dim';
  const bg = tone === 'error' ? 'bg-red-faded/[0.08]' : 'bg-desk-edge';
  return (
    <section>
      <div className={`border ${border} ${bg} px-5 py-4 max-w-xl`}>
        <div className={`font-stamp ${stampColor} text-sm uppercase tracking-widest`}>
          {title}
        </div>
        <p className="font-ui text-[12px] mt-2 text-paper-worn tracking-[0.04em] leading-relaxed">
          {body}
        </p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className={[
              'mt-4 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
              'text-green-accent border border-green-mid bg-green-accent/[0.06]',
              'transition-all duration-150',
              'hover:bg-green-accent/[0.12] hover:border-green-bright',
            ].join(' ')}
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Spinner({ tone }: { tone: 'green' | 'red' }) {
  const color = tone === 'red' ? 'bg-red-stamp' : 'bg-green-accent';
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-[5px] h-[5px] rounded-full dg-status-dot ${color}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Button classes                                                            */
/* -------------------------------------------------------------------------- */

const acceptButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'cursor-pointer transition-all duration-150',
  'flex items-center gap-2',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
].join(' ');

const declineButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
  'cursor-pointer transition-all duration-150',
  'flex items-center gap-2',
  'hover:bg-red-faded/[0.16] hover:shadow-[0_0_12px_rgba(170,80,80,0.18)]',
  'focus:outline-none focus:border-red-stamp',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
].join(' ');
