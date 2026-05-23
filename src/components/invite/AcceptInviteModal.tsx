/**
 * Accept-invite modal (DEL-81).
 *
 * Opened from the Notifications inbox in place of navigating to
 * `/invitations/:id`. Drops the agent picker entirely — accepting
 * signs the user up as an active `player` with no PC; assignment
 * happens later via the Agent Panel ASSIGN flow.
 *
 * Loads the invitation via `getInvitationForAccept`. On a non-pending /
 * expired / soft-deleted-campaign row, renders an inline "gone" body
 * with the matching copy (the standalone `InviteGoneScreen` uses
 * full-page `AuthShell` chrome — not usable inside `ModalShell`, so the
 * copy is inlined here).
 *
 * Accept calls the new `accept_invitation` RPC. On accept the parent
 * closes the modal and refreshes the inbox. Decline reuses the existing
 * `declineInvitation` mutation.
 */

import { useCallback, useEffect, useState } from 'react';

import { ModalShell } from '@/components/common/ModalShell';
import type { InviteGoneVariant } from '@/components/invite/InviteGoneScreen';
import { useToast } from '@/contexts/ToastContext';
import {
  acceptInvitation,
  declineInvitation,
  getInvitationForAccept,
} from '@/lib/invitations';
import type { InvitationAcceptView } from '@/types/members';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'gone'; variant: InviteGoneVariant; campaignName: string | null }
  | { kind: 'ready'; invitation: InvitationAcceptView };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'accepting' }
  | { kind: 'declining' }
  | { kind: 'error'; message: string };

export type AcceptInviteModalProps = {
  invitationId: string;
  onClose: () => void;
  /**
   * Called after a terminal action (accept, decline, or any "gone" path
   * the user dismisses) so the parent can refresh its list. The modal
   * still closes via `onClose`; this is an additional signal.
   */
  onResolved: () => void;
};

export function AcceptInviteModal({
  invitationId,
  onClose,
  onResolved,
}: AcceptInviteModalProps) {
  const { showToast } = useToast();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });

    const result = await getInvitationForAccept(invitationId);
    if (!result.ok) {
      if (result.kind === 'not_found') {
        setState({ kind: 'not_found' });
        return;
      }
      setState({ kind: 'error' });
      return;
    }

    const inv = result.data;
    const variant = resolveGoneVariant(inv);
    if (variant) {
      setState({ kind: 'gone', variant, campaignName: inv.campaign_name });
      return;
    }

    setState({ kind: 'ready', invitation: inv });
  }, [invitationId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleAccept() {
    if (state.kind !== 'ready' || submit.kind === 'accepting' || submit.kind === 'declining') {
      return;
    }

    setSubmit({ kind: 'accepting' });
    const result = await acceptInvitation(state.invitation.invitation_id);

    if (!result.ok) {
      setSubmit({
        kind: 'error',
        message: 'Could not accept the invitation. Try again.',
      });
      return;
    }

    if (result.data.status === 'accepted') {
      showToast('success', 'Welcome to the operation.');
      onResolved();
      onClose();
      return;
    }

    // Non-accept terminal status — swap to the matching gone body.
    setSubmit({ kind: 'idle' });
    if (result.data.status === 'gone') {
      void load();
      return;
    }
    setState({
      kind: 'gone',
      variant: result.data.status,
      campaignName: state.invitation.campaign_name,
    });
  }

  async function handleDecline() {
    if (state.kind !== 'ready' || submit.kind === 'accepting' || submit.kind === 'declining') {
      return;
    }
    setSubmit({ kind: 'declining' });
    const result = await declineInvitation(state.invitation.invitation_id);

    if (!result.ok) {
      setSubmit({
        kind: 'error',
        message: 'Could not decline the invitation. Try again.',
      });
      return;
    }

    if (result.data.matched === 0) {
      // Race: status flipped under us. Refetch so the right gone body
      // shows, rather than silently closing.
      setSubmit({ kind: 'idle' });
      void load();
      return;
    }

    showToast('info', 'Invitation declined.');
    onResolved();
    onClose();
  }

  const busy = submit.kind === 'accepting' || submit.kind === 'declining';

  return (
    <ModalShell
      title="Invitation received"
      subtitle="Confirm assignment to operation"
      onClose={onClose}
      preventClose={busy}
      width={560}
    >
      {state.kind === 'loading' ? (
        <InlineNotice tone="notice" title="Decrypting" body="Loading invitation…" />
      ) : null}

      {state.kind === 'error' ? (
        <InlineNotice
          tone="error"
          title="Transmission failed"
          body="Could not load the invitation. Try again."
          action={{ label: 'Retry', onClick: () => void load() }}
        />
      ) : null}

      {state.kind === 'not_found' ? (
        <InlineNotice
          tone="error"
          title="Unknown invitation"
          body="This invitation could not be found. It may have been deleted by the Handler."
          action={{
            label: 'Close',
            onClick: () => {
              onResolved();
              onClose();
            },
          }}
        />
      ) : null}

      {state.kind === 'gone' ? (
        <GoneBody
          variant={state.variant}
          campaignName={state.campaignName}
          onDismiss={() => {
            onResolved();
            onClose();
          }}
        />
      ) : null}

      {state.kind === 'ready' ? (
        <ReadyBody
          invitation={state.invitation}
          submit={submit}
          onAccept={() => void handleAccept()}
          onDecline={() => void handleDecline()}
        />
      ) : null}
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bodies                                                                    */
/* -------------------------------------------------------------------------- */

function ReadyBody({
  invitation,
  submit,
  onAccept,
  onDecline,
}: {
  invitation: InvitationAcceptView;
  submit: SubmitState;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const seatsFull = invitation.active_member_count >= invitation.campaign_max_agents;
  const busy = submit.kind === 'accepting' || submit.kind === 'declining';

  return (
    <div className="flex flex-col gap-5">
      <CampaignSummary invitation={invitation} seatsFull={seatsFull} />

      {invitation.message ? <MessageCard message={invitation.message} /> : null}

      {submit.kind === 'error' ? (
        <div role="alert" className="border border-red-faded bg-red-faded/[0.08] px-3 py-2">
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
          onClick={onDecline}
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
          onClick={onAccept}
          disabled={busy}
          className={acceptButtonClass}
        >
          {submit.kind === 'accepting' ? (
            <>
              <Spinner tone="green" />
              Accepting…
            </>
          ) : (
            'Accept'
          )}
        </button>
      </div>
    </div>
  );
}

function GoneBody({
  variant,
  campaignName,
  onDismiss,
}: {
  variant: InviteGoneVariant;
  campaignName: string | null;
  onDismiss: () => void;
}) {
  const { title, body } = GONE_COPY[variant];
  return (
    <div className="flex flex-col gap-4">
      <div className="border border-red-faded bg-red-faded/[0.08] px-4 py-3">
        <div className="font-stamp text-[12px] tracking-[0.18em] uppercase text-red-stamp mb-1">
          {title}
        </div>
        <div className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed">
          {body(campaignName)}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onDismiss} className={dismissButtonClass}>
          Close
        </button>
      </div>
    </div>
  );
}

function CampaignSummary({
  invitation,
  seatsFull,
}: {
  invitation: InvitationAcceptView;
  seatsFull: boolean;
}) {
  const expiresMs = new Date(invitation.expires_at).getTime();
  const expiresIn = Number.isFinite(expiresMs) ? formatRelativeFuture(expiresMs) : null;

  return (
    <div className="border border-green-dim bg-desk-edge px-4 py-3">
      <div className="font-display text-[20px] tracking-[0.14em] uppercase text-paper">
        {invitation.campaign_name}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 font-ui text-[11px] tracking-[0.14em] uppercase">
        <span className="text-green-mid">
          Invited by{' '}
          <span className="text-paper-worn">
            {invitation.inviter_username ?? 'Handler'}
          </span>
        </span>
        <span className={seatsFull ? 'text-red-stamp' : 'text-green-mid'}>
          Seats{' '}
          <span className={seatsFull ? 'text-red-stamp' : 'text-paper-worn'}>
            {invitation.active_member_count} / {invitation.campaign_max_agents}
          </span>
        </span>
        {expiresIn ? (
          <span className="text-green-mid">
            Expires <span className="text-paper-worn">{expiresIn}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MessageCard({ message }: { message: string }) {
  return (
    <div className="border border-green-dim bg-desk-edge px-4 py-3">
      <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-amber-dim mb-2">
        Handler's message
      </div>
      <div className="font-body text-[13px] text-paper-worn whitespace-pre-wrap leading-relaxed">
        {message}
      </div>
    </div>
  );
}

function InlineNotice({
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
    <div className="flex flex-col gap-4">
      <div className={`border ${border} ${bg} px-4 py-3`}>
        <div className={`font-stamp ${stampColor} text-[12px] uppercase tracking-[0.18em] mb-1`}>
          {title}
        </div>
        <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed">
          {body}
        </p>
      </div>
      {action ? (
        <div className="flex justify-end">
          <button type="button" onClick={action.onClick} className={dismissButtonClass}>
            {action.label}
          </button>
        </div>
      ) : null}
    </div>
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
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function resolveGoneVariant(invitation: InvitationAcceptView): InviteGoneVariant | null {
  if (invitation.campaign_deleted_at) return 'deleted';

  if (invitation.status !== 'pending') {
    return invitation.status as InviteGoneVariant;
  }

  const expiresMs = new Date(invitation.expires_at).getTime();
  if (Number.isFinite(expiresMs) && expiresMs < Date.now()) return 'expired';
  return null;
}

function formatRelativeFuture(targetMs: number): string {
  const deltaMs = targetMs - Date.now();
  if (deltaMs <= 0) return 'soon';
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} hr`;
  const days = Math.round(hours / 24);
  return `in ${days} days`;
}

const GONE_COPY: Record<
  InviteGoneVariant,
  { title: string; body: (campaignName: string | null) => string }
> = {
  revoked: {
    title: 'Invitation revoked',
    body: (name) =>
      name
        ? `The Handler revoked this invitation to "${name}" before it could be accepted.`
        : 'The Handler revoked this invitation before it could be accepted.',
  },
  expired: {
    title: 'Invitation expired',
    body: (name) =>
      name
        ? `This invitation to "${name}" has expired. Ask the Handler to send a fresh one.`
        : 'This invitation has expired. Ask the Handler to send a fresh one.',
  },
  accepted: {
    title: 'Already accepted',
    body: (name) =>
      name
        ? `This invitation to "${name}" has already been accepted.`
        : 'This invitation has already been accepted.',
  },
  declined: {
    title: 'Already declined',
    body: (name) =>
      name
        ? `This invitation to "${name}" has already been declined.`
        : 'This invitation has already been declined.',
  },
  deleted: {
    title: 'Campaign closed',
    body: (name) =>
      name
        ? `The campaign "${name}" no longer exists. Ask the Handler if a new operation is being assembled.`
        : 'This campaign no longer exists.',
  },
  full: {
    title: 'Roster full',
    body: (name) =>
      name
        ? `The roster for "${name}" is full. Ask the Handler if a seat opens up.`
        : 'The roster is full. Ask the Handler if a seat opens up.',
  },
};

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

const dismissButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
].join(' ');
