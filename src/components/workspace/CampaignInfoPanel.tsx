/**
 * Campaign Info Panel — wireframe layout for GM + Player views (DEL-75).
 *
 * Supersedes the original read-only panel from DEL-70: same data sources,
 * but the chrome and footer follow the GM/Player wireframes. Rendered in
 * the left column of `CampaignsLandingPage` via the panel-swap from DEL-69.
 *
 * Role derivation: `useCurrentCampaignRole` keys off the campaign in the
 * URL; the landing page has no `:campaignId` segment, so the hook would
 * return idle here. `CampaignsLandingPage` already knows the caller's
 * role from the membership row that opened the panel — we accept it as a
 * prop instead of re-deriving.
 *
 * Action buttons (MANAGE PLAYERS, EDIT, INVITE MORE PLAYERS, INFO,
 * ASSIGN) are all stubs in this ticket. Each opens an empty overlay with
 * a BACK button in the lower-left. Real bodies + wiring live in
 * follow-up tickets (see DEL-75 Out of Scope).
 *
 * Row visibility rules:
 *   - INFO appears on any accepted row whose member has a PC attached.
 *   - ASSIGN appears only on the caller's own row, and only when the
 *     caller has no PC attached in this campaign.
 *   - Invited rows show an amber status dot and no action button.
 */

import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getCampaignById } from '@/lib/campaigns';
import { listCampaignMembers, listPendingInvitations } from '@/lib/members';
import { listCampaignPcs } from '@/lib/player-characters';
import { useAuth } from '@/contexts/AuthContext';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import { ModalShell } from '@/components/common/ModalShell';
import { InviteModal } from '@/components/workspace/InviteModal';
import type { Campaign } from '@/types/campaigns';
import type {
  CampaignMemberWithProfile,
  PendingInvitationWithProfile,
} from '@/types/members';

export type CampaignInfoPanelProps = {
  campaignId: string;
  campaignName: string;
  memberCount: number;
  maxAgents: number;
  /** Caller's role in this campaign — sourced from the membership row in
   *  `CampaignsLandingPage`, not from `useCurrentCampaignRole` (the hook
   *  is route-bound and idle on this page). */
  role: 'gm' | 'player';
  onClose: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      campaign: Campaign;
      members: CampaignMemberWithProfile[];
      pendingInvitations: PendingInvitationWithProfile[];
      pcsByOwner: Record<string, string>;
    };

type StubKind = 'manage-players' | 'edit' | 'info' | 'assign';

const STUB_TITLES: Record<StubKind, string> = {
  'manage-players': 'Manage Players',
  edit: 'Edit Campaign',
  info: 'Agent Info',
  assign: 'Assign Character',
};

export function CampaignInfoPanel({
  campaignId,
  campaignName,
  memberCount,
  maxAgents,
  role,
  onClose,
}: CampaignInfoPanelProps) {
  const { user } = useAuth();
  const callerId = user?.id ?? null;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [stub, setStub] = useState<StubKind | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });

    const [campaignResult, membersResult, invitesResult, pcsResult] =
      await Promise.all([
        getCampaignById(campaignId),
        listCampaignMembers(campaignId),
        listPendingInvitations(campaignId),
        listCampaignPcs(campaignId),
      ]);

    if (
      !campaignResult.ok ||
      !membersResult.ok ||
      !invitesResult.ok ||
      !pcsResult.ok
    ) {
      setState({ kind: 'error' });
      return;
    }

    const pcsByOwner: Record<string, string> = {};
    for (const pc of pcsResult.data) {
      if (!(pc.owner_id in pcsByOwner)) {
        pcsByOwner[pc.owner_id] = pc.name;
      }
    }

    setState({
      kind: 'ready',
      campaign: campaignResult.data,
      members: membersResult.data,
      pendingInvitations: invitesResult.data,
      pcsByOwner,
    });
  }, [campaignId]);

  useEffect(() => {
    void Promise.resolve().then(() => reload());
  }, [reload]);

  // DEL-82: only paint the loading card if the fetch is still pending
  // after a short delay — fast loads (the common case) swap straight to
  // the ready body with no flash.
  const showLoading = useDelayedFlag(state.kind === 'loading');

  const { gm, activePlayers } = useMemo(() => {
    if (state.kind !== 'ready') {
      return { gm: null, activePlayers: [] as CampaignMemberWithProfile[] };
    }
    const active = state.members.filter((m) => m.status === 'active');
    return {
      gm: active.find((m) => m.role === 'gm') ?? null,
      activePlayers: active.filter((m) => m.role === 'player'),
    };
  }, [state]);

  const isGm = role === 'gm';

  return (
    <section>
      <header className="mb-7 flex items-start justify-between gap-4">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper truncate min-w-0">
          {campaignName}
        </h1>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="font-ui text-[10px] tracking-[0.18em] uppercase text-green-mid">
            Player slots
          </span>
          <span className="font-display text-[20px] font-light tracking-[0.08em] text-paper mt-[2px]">
            {memberCount}/{maxAgents}
          </span>
        </div>
      </header>

      {state.kind === 'loading' && showLoading ? <LoadingCard /> : null}
      {state.kind === 'error' ? <ErrorCard onRetry={() => void reload()} /> : null}

      {state.kind === 'ready' ? (
        <div className="flex flex-col gap-7">
          {state.campaign.description ? (
            <div className="flex flex-col gap-3">
              <div className="font-ui text-[10px] tracking-[0.18em] uppercase text-green-mid">
                Description
              </div>
              <p className="font-ui text-[12px] leading-relaxed text-paper-worn whitespace-pre-line">
                {state.campaign.description}
              </p>
              <hr className="border-t border-green-dim/40 mt-1" />
            </div>
          ) : null}

          <GameMasterSection gm={gm} />

          <hr className="border-t border-green-dim/40 -mt-2" />

          <PlayersSection
            players={activePlayers}
            pendingInvitations={state.pendingInvitations}
            pcsByOwner={state.pcsByOwner}
            callerId={callerId}
            onInfo={() => setStub('info')}
            onAssign={() => setStub('assign')}
            headerAction={
              isGm ? (
                <button
                  type="button"
                  onClick={() => setStub('manage-players')}
                  className={secondaryButtonClass}
                >
                  Manage Players
                </button>
              ) : null
            }
          />

          {isGm ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className={dashedCtaClass}
            >
              + Invite More Players
            </button>
          ) : null}

          <footer className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={secondaryButtonClass}
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {isGm ? (
                <button
                  type="button"
                  onClick={() => setStub('edit')}
                  className={secondaryButtonClass}
                >
                  Edit
                </button>
              ) : null}
              <Link to={`/campaigns/${campaignId}/operations`} className={primaryButtonClass}>
                Open
              </Link>
            </div>
          </footer>
        </div>
      ) : null}

      {stub ? <StubOverlay kind={stub} onBack={() => setStub(null)} /> : null}
      {inviteOpen ? (
        <InviteModal
          campaignId={campaignId}
          callerId={callerId}
          onClose={() => {
            setInviteOpen(false);
            void reload();
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Game Master section                                                       */
/* -------------------------------------------------------------------------- */

function GameMasterSection({
  gm,
}: {
  gm: CampaignMemberWithProfile | null;
}) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        Game Master
      </h2>
      {gm ? (
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="font-ui text-[14px] text-amber-dim leading-none"
            title="Handler"
          >
            ♛
          </span>
          <span className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
            {gm.username ?? 'unknown handler'}
          </span>
        </div>
      ) : (
        <div className="font-ui text-[12px] uppercase tracking-[0.12em] text-green-mid">
          No handler assigned.
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Players section                                                           */
/* -------------------------------------------------------------------------- */

function PlayersSection({
  players,
  pendingInvitations,
  pcsByOwner,
  callerId,
  onInfo,
  onAssign,
  headerAction,
}: {
  players: CampaignMemberWithProfile[];
  pendingInvitations: PendingInvitationWithProfile[];
  pcsByOwner: Record<string, string>;
  callerId: string | null;
  onInfo: () => void;
  onAssign: () => void;
  headerAction?: ReactNode;
}) {
  const total = players.length + pendingInvitations.length;
  const isEmpty = total === 0;

  return (
    <SectionShell title="Players" headerAction={headerAction}>
      {isEmpty ? (
        <SectionEmpty text="No agents yet." />
      ) : (
        <ul>
          {players.map((m) => {
            const pcName = pcsByOwner[m.user_id] ?? null;
            const isOwnRow = callerId !== null && m.user_id === callerId;
            return (
              <PlayerRow
                key={m.id}
                username={m.username}
                pcName={pcName}
                badge="accepted"
                action={
                  pcName
                    ? { kind: 'info', onClick: onInfo }
                    : isOwnRow
                      ? { kind: 'assign', onClick: onAssign }
                      : { kind: 'none' }
                }
              />
            );
          })}
          {pendingInvitations.map((i) => (
            <PlayerRow
              key={i.id}
              username={i.username ?? i.invitee_email}
              pcName={null}
              badge="invited"
              action={{ kind: 'none' }}
            />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

type RowAction =
  | { kind: 'none' }
  | { kind: 'info'; onClick: () => void }
  | { kind: 'assign'; onClick: () => void };

function PlayerRow({
  username,
  pcName,
  badge,
  action,
}: {
  username: string | null;
  pcName: string | null;
  badge: 'accepted' | 'invited';
  action: RowAction;
}) {
  const handle = username ?? 'unknown agent';

  return (
    <li className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot variant={badge} />
        <span className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {handle}
        </span>
      </div>
      <div className="flex flex-col items-center text-center min-w-0">
        <span className="font-ui text-[9px] tracking-[0.18em] uppercase text-green-mid">
          Character
        </span>
        <span className="font-ui text-[12px] tracking-[0.06em] text-paper-worn truncate max-w-full mt-[1px]">
          {pcName ?? 'Unassigned'}
        </span>
      </div>
      <div className="flex justify-end">
        {action.kind === 'info' ? (
          <button type="button" onClick={action.onClick} className={rowButtonClass}>
            Info
          </button>
        ) : null}
        {action.kind === 'assign' ? (
          <button type="button" onClick={action.onClick} className={rowButtonClass}>
            Assign
          </button>
        ) : null}
      </div>
    </li>
  );
}

function StatusDot({ variant }: { variant: 'accepted' | 'invited' }) {
  const tone =
    variant === 'accepted' ? 'bg-green-accent' : 'bg-amber-dim';
  const label = variant === 'accepted' ? 'Accepted' : 'Invited';
  return (
    <span
      aria-label={label}
      title={label}
      className={[
        'inline-block w-[8px] h-[8px] rounded-full flex-shrink-0',
        tone,
      ].join(' ')}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function SectionShell({
  title,
  headerAction,
  children,
}: {
  title: string;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3">
        <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn">
          {title}
        </h2>
        {headerAction}
      </div>
      <div className="border border-green-dim bg-desk-edge">{children}</div>
    </section>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="px-4 py-5 font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
      {text}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4">
      <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
        Loading campaign…
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/70 tracking-[0.1em] uppercase">
        Decrypting member records
      </div>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-red-faded bg-red-faded/10 px-5 py-4">
      <div className="font-stamp text-red-stamp text-sm uppercase tracking-widest">
        Transmission failed
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/80 tracking-[0.1em] uppercase">
        Could not load the campaign.
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={[
          'mt-3 font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[7px]',
          'text-paper-worn border border-green-dim/60 bg-transparent',
          'hover:text-paper hover:border-green-mid transition-colors',
        ].join(' ')}
      >
        Retry
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stub overlay                                                              */
/* -------------------------------------------------------------------------- */

function StubOverlay({ kind, onBack }: { kind: StubKind; onBack: () => void }) {
  return (
    <ModalShell title={STUB_TITLES[kind]} onClose={onBack} width={460}>
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid mb-6">
        Coming soon.
      </p>
      <div className="flex justify-start">
        <button type="button" onClick={onBack} className={secondaryButtonClass}>
          Back
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared button classes                                                     */
/* -------------------------------------------------------------------------- */

const primaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
].join(' ');

const secondaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-paper-worn border border-green-dim/60 bg-transparent',
  'transition-all duration-150',
  'hover:text-paper hover:border-green-mid',
].join(' ');

const rowButtonClass = [
  'font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[6px] flex-shrink-0',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
].join(' ');

const dashedCtaClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[12px]',
  'text-green-mid border border-dashed border-green-dim bg-transparent',
  'transition-all duration-150',
  'hover:text-paper hover:border-green-mid hover:bg-green-accent/[0.04]',
].join(' ');
