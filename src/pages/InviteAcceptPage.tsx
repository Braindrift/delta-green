/**
 * In-app accept-invite flow (DEL-46) — replaces the placeholder shipped
 * with DEL-45.
 *
 * Sits inside the workspace shell at `/invitations/:invitationId`. Two
 * entry paths land here, both already covered by upstream tickets:
 *
 *   1. Notifications inbox deep-link (DEL-50, lands later — the route is
 *      ready). The inbox can pass `location.state.from = '/notifications'`
 *      so a decline routes back to the inbox.
 *   2. `InviteTokenPage` redirects here after `claim_invitation_by_token`
 *      succeeds. The claim normalises the row into an existing-user
 *      invite (`invitee_user_id = auth.uid()`), so this page treats both
 *      paths identically.
 *
 * Flow shape:
 *
 *   - Load the invitation + campaign + inviter + seat count in one go
 *     (`getInvitationForAccept`). If the row is non-pending, expired,
 *     or its campaign is soft-deleted, route into the right
 *     `InviteGoneScreen` variant at render time. Otherwise render the
 *     PC picker.
 *   - PC picker reads from `listJoinablePlayerCharacters` (owner +
 *     unassigned + not deleted + no campaign). Inline "Create new agent"
 *     button mounts `AgentForm` inside `ModalShell`; the newly created
 *     PC is prepended to the list and auto-selected — matches the
 *     "drops in alongside the existing picker" contract from DEL-51's
 *     AgentForm docstring.
 *   - Accept calls `accept_invitation_with_pc` (RPC). The RPC's
 *     `(campaign_id, status)` row is the discriminator. On success:
 *     navigate to `/campaigns/:id/operations`. On `gone`/`full`/`deleted`:
 *     swap into the matching `InviteGoneScreen` without a refetch.
 *   - Decline calls `declineInvitation` (direct UPDATE under
 *     invitee-update RLS) and routes to `location.state.from ?? '/'`.
 *
 * The seat counter and `expires_at` are advisory — the RPC does the
 * authoritative checks at accept time. Showing them up front avoids
 * surprises (the user sees `Seats 5 / 6` and the expiry pill before
 * they pick a PC).
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { AgentForm } from '@/components/agents/AgentForm';
import { InviteGoneScreen, type InviteGoneVariant } from '@/components/invite/InviteGoneScreen';
import { ModalShell } from '@/components/common/ModalShell';
import { useToast } from '@/contexts/ToastContext';
import {
  acceptInvitationWithPc,
  declineInvitation,
  getInvitationForAccept,
} from '@/lib/invitations';
import { listJoinablePlayerCharacters } from '@/lib/player-characters';
import type { InvitationAcceptView } from '@/types/members';
import type { PlayerCharacter } from '@/types/player-characters';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'gone'; variant: InviteGoneVariant; campaignName: string | null }
  | { kind: 'ready'; invitation: InvitationAcceptView; pcs: PlayerCharacter[] };

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

  const fallback = ((location.state as LocationState)?.from ?? '/') || '/';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedPcId, setSelectedPcId] = useState<string | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const [showCreateModal, setShowCreateModal] = useState(false);

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

    const pcResult = await listJoinablePlayerCharacters();
    if (!pcResult.ok) {
      setState({ kind: 'error' });
      return;
    }

    setState({ kind: 'ready', invitation: inv, pcs: pcResult.data });
  }, [invitationId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleAccept() {
    if (state.kind !== 'ready' || submit.kind === 'accepting' || submit.kind === 'declining') {
      return;
    }
    if (!selectedPcId) return;

    setSubmit({ kind: 'accepting' });
    const result = await acceptInvitationWithPc(state.invitation.invitation_id, selectedPcId);

    if (!result.ok) {
      setSubmit({
        kind: 'error',
        message: 'Could not accept the invitation. Try again.',
      });
      return;
    }

    if (result.data.status === 'accepted') {
      showToast('success', 'Welcome to the operation.');
      navigate(`/campaigns/${result.data.campaign_id}/operations`, { replace: true });
      return;
    }

    // Non-accept terminal status. `'full'` / `'deleted'` map directly to
    // `InviteGoneScreen` variants — flip the page without a refetch.
    // `'gone'` is the catch-all (invitation moved out of pending under us,
    // PC no longer eligible, etc.) — refetch so the page picks the right
    // variant (`revoked` / `expired` / `accepted` / `declined`) from the
    // current invitation row.
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
        action={{ label: 'Back to campaigns', onClick: () => navigate('/', { replace: true }) }}
      />
    );
  }
  if (state.kind === 'gone') {
    return <InviteGoneScreen variant={state.variant} campaignName={state.campaignName} />;
  }

  const { invitation, pcs } = state;
  const seatsFull = invitation.active_member_count >= invitation.campaign_max_agents;
  const busy = submit.kind === 'accepting' || submit.kind === 'declining';

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Invitation received
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Confirm assignment to operation
        </p>
      </header>

      <div className="flex flex-col gap-6 max-w-2xl">
        <CampaignSummary invitation={invitation} seatsFull={seatsFull} />

        {invitation.message ? <MessageCard message={invitation.message} /> : null}

        <PcPickerSection
          pcs={pcs}
          selectedPcId={selectedPcId}
          onSelect={setSelectedPcId}
          onOpenCreate={() => setShowCreateModal(true)}
          disabled={busy}
        />

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
            disabled={busy || !selectedPcId}
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

      {showCreateModal ? (
        <ModalShell
          title="New agent"
          subtitle="File a new player character"
          onClose={() => setShowCreateModal(false)}
          width={520}
        >
          <AgentForm
            mode={{ kind: 'create' }}
            onCancel={() => setShowCreateModal(false)}
            onSubmitted={(pc) => {
              setShowCreateModal(false);
              setState((prev) =>
                prev.kind === 'ready'
                  ? { ...prev, pcs: [pc, ...prev.pcs] }
                  : prev,
              );
              setSelectedPcId(pc.id);
              showToast('success', 'Agent created.');
            }}
          />
        </ModalShell>
      ) : null}
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

function PcPickerSection({
  pcs,
  selectedPcId,
  onSelect,
  onOpenCreate,
  disabled,
}: {
  pcs: PlayerCharacter[];
  selectedPcId: string | null;
  onSelect: (id: string) => void;
  onOpenCreate: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn">
            Choose an agent
          </div>
          <div className="font-ui text-[10px] tracking-[0.12em] uppercase text-green-mid mt-1">
            Bring an unassigned agent into the operation
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          disabled={disabled}
          className={createPcButtonClass}
        >
          + Create new
        </button>
      </div>

      <div className="border border-green-dim bg-desk-edge">
        {pcs.length === 0 ? (
          <div className="px-4 py-5 font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
            No unassigned agents available. Create one to continue.
          </div>
        ) : (
          <ul role="radiogroup" aria-label="Select an agent">
            {pcs.map((pc) => {
              const selected = pc.id === selectedPcId;
              return (
                <li
                  key={pc.id}
                  className="border-b border-green-dim/40 last:border-b-0"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect(pc.id)}
                    disabled={disabled}
                    className={[
                      'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
                      selected
                        ? 'bg-green-accent/[0.08]'
                        : 'hover:bg-green-accent/[0.04]',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'inline-block w-[10px] h-[10px] flex-shrink-0',
                        'border',
                        selected
                          ? 'border-green-bright bg-green-accent/60'
                          : 'border-green-dim bg-transparent',
                      ].join(' ')}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className={[
                          'font-ui text-[12px] tracking-[0.06em] truncate block',
                          selected ? 'text-paper' : 'text-paper-worn',
                        ].join(' ')}
                      >
                        {pc.name}
                      </span>
                      <span className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px] truncate block">
                        {pc.archetype ?? '—'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
    // The four invite-row terminal statuses line up 1:1 with the
    // matching `InviteGoneVariant`s.
    return invitation.status as InviteGoneVariant;
  }

  const expiresMs = new Date(invitation.expires_at).getTime();
  if (Number.isFinite(expiresMs) && expiresMs < Date.now()) return 'expired';
  return null;
}

/**
 * Human-friendly relative expiry. Coarse — minute / hour / day buckets —
 * enough for an invitation that's days away from expiring.
 */
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

const createPcButtonClass = [
  'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[7px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150 cursor-pointer',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');
