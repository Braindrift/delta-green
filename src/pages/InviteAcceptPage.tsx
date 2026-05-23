/**
 * In-app accept-invite flow — magic-link landing surface (DEL-81 rework).
 *
 * Post-DEL-81 the Notifications inbox opens invitations as a modal in
 * place (`AcceptInviteModal`). This page survives as the deep-link
 * fallback the magic-link path lands on: `InviteTokenPage` claims the
 * token then `replace`s to `/invitations/:invitationId`, so something
 * has to render here.
 *
 * Shape matches the modal: campaign summary + Handler's message + Accept
 * / Decline. There is no agent picker. Accepting calls the no-PC
 * `accept_invitation` RPC and routes the user to `/notifications`
 * (was `/campaigns/:id/operations`); they pick an agent later via the
 * Agent Panel ASSIGN flow.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { InviteGoneScreen, type InviteGoneVariant } from '@/components/invite/InviteGoneScreen';
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

type LocationState = { from?: string } | null;

export function InviteAcceptPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const fallback =
    ((location.state as LocationState)?.from ?? '/notifications') || '/notifications';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const load = useCallback(async () => {
    if (!invitationId) {
      setState({ kind: 'not_found' });
      return;
    }
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
      navigate('/notifications', { replace: true });
      return;
    }

    // Non-accept terminal status — swap to the matching gone variant.
    // `'gone'` is the catch-all (status flipped under us); refetch so the
    // page picks the right variant from the current row.
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
      // Race: status flipped under us. Refetch so the right gone variant
      // shows, rather than silently routing away.
      setSubmit({ kind: 'idle' });
      void load();
      return;
    }

    showToast('info', 'Invitation declined.');
    navigate(fallback, { replace: true });
  }

  if (state.kind === 'loading') {
    return <CenteredCard tone="notice" title="Decrypting" body="Loading invitation…" />;
  }
  if (state.kind === 'error') {
    return (
      <CenteredCard
        tone="error"
        title="Transmission failed"
        body="Could not load the invitation. Try again."
        action={{ label: 'Retry', onClick: () => void load() }}
      />
    );
  }
  if (state.kind === 'not_found') {
    return (
      <CenteredCard
        tone="error"
        title="Unknown invitation"
        body="This invitation could not be found. It may have been deleted by the Handler."
        action={{ label: 'Back to notifications', onClick: () => navigate('/notifications', { replace: true }) }}
      />
    );
  }
  if (state.kind === 'gone') {
    return <InviteGoneScreen variant={state.variant} campaignName={state.campaignName} />;
  }

  const { invitation } = state;
  const seatsFull = invitation.active_member_count >= invitation.campaign_max_agents;
  const busy = submit.kind === 'accepting' || submit.kind === 'declining';

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Invitation received
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Accept or decline
        </p>
      </header>

      <div className="flex flex-col gap-6 max-w-2xl">
        <CampaignSummary invitation={invitation} seatsFull={seatsFull} />

        {invitation.message ? <MessageCard message={invitation.message} /> : null}

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
              'Accept'
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Subviews                                                                  */
/* -------------------------------------------------------------------------- */

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
    <div className="border border-green-dim bg-desk-edge px-5 py-4">
      <div className="font-display text-[22px] tracking-[0.14em] uppercase text-paper">
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
    <div className="border border-green-dim bg-desk-edge px-5 py-4">
      <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-amber-dim mb-2">
        Handler's message
      </div>
      <div className="font-body text-[13px] text-paper-worn whitespace-pre-wrap leading-relaxed">
        {message}
      </div>
    </div>
  );
}

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
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Map the loaded invitation view to a terminal `InviteGoneVariant` when
 * the row is not pending or its campaign is gone. Returns `null` when
 * the page should render the live accept flow.
 *
 * `'expired'` here handles status='pending' rows whose `expires_at` is
 * already in the past — there's no expiry sweep so the stored status
 * stays `'pending'` until something writes the row.
 */
function resolveGoneVariant(
  invitation: InvitationAcceptView,
): InviteGoneVariant | null {
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
