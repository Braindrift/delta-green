/**
 * Campaign Info Panel — read-only campaign summary visible to any active
 * member (DEL-70).
 *
 * Rendered in the left column of the workspace landing page via the
 * panel-swap mechanism introduced in DEL-69 (`PanelView`). The caller
 * hands over campaign identity and the already-loaded
 * `memberCount` / `maxAgents` so the header can paint immediately while
 * the deeper roster fetch is still in flight.
 *
 * Fetches on mount, in parallel:
 *   - `getCampaignById`        — for the description text.
 *   - `listCampaignMembers`    — every visible row in the campaign. The
 *     member-side RLS policy was tightened to active rows only in
 *     `20260521085121_tighten_member_read_to_active.sql`, so non-Handlers
 *     get exactly the rows this view wants; Handlers continue to see
 *     former rows here too, but the panel filters to active before
 *     rendering anyway.
 *   - `listPendingInvitations` — pending invites for the campaign.
 *     `campaign_invitations` is Handler-readable only, so this returns an
 *     empty list for non-Handlers; the section just collapses. No
 *     role-gating is needed in the component for that reason.
 *   - `listCampaignPcs`        — `{ owner_id, name }` rows for every PC
 *     attached to the campaign, merged by `user_id === owner_id` to show
 *     the assigned Agent name next to each member.
 *
 * Handler-specific extensions (invite, kick, revoke, settings, transfer,
 * delete) are deferred to DEL-71; this component is purely read-only.
 */

import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getCampaignById } from '@/lib/campaigns';
import { listCampaignMembers, listPendingInvitations } from '@/lib/members';
import { listCampaignPcs } from '@/lib/player-characters';
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

export function CampaignInfoPanel({
  campaignId,
  campaignName,
  memberCount,
  maxAgents,
  onClose,
}: CampaignInfoPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

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

    // Build the owner → PC-name map. The Members screen specs one PC per
    // active member, but the schema doesn't enforce that, so the map
    // keeps the first PC alphabetically (the query is ordered by name)
    // and silently drops duplicates — good enough for the badge text and
    // matches the screen mock's single-PC display.
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
    // Defer the first state update by a microtask so the synchronous
    // setState({ kind: 'loading' }) doesn't fire on the same tick as the
    // effect body. Same pattern as `ManageMembersPage`.
    void Promise.resolve().then(() => reload());
  }, [reload]);

  // Split active members into the GM row and the player list. The GM
  // renders separately above the player list per the ticket; the
  // player list omits the GM. Former members are excluded from both
  // (RLS already hides them for non-Handlers; the explicit filter
  // covers the Handler case where they'd otherwise be visible here).
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

  return (
    <section>
      <header className="mb-7 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper truncate">
            {campaignName}
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            {memberCount} / {maxAgents} players
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-paper-worn border border-green-dim/60 bg-transparent',
            'transition-all duration-150',
            'hover:text-paper hover:border-green-mid',
          ].join(' ')}
        >
          Close
        </button>
      </header>

      {state.kind === 'loading' ? <LoadingCard /> : null}
      {state.kind === 'error' ? <ErrorCard onRetry={() => void reload()} /> : null}

      {state.kind === 'ready' ? (
        <div className="flex flex-col gap-7">
          {state.campaign.description ? (
            <p className="font-ui text-[12px] leading-relaxed text-paper-worn whitespace-pre-line">
              {state.campaign.description}
            </p>
          ) : null}

          <GameMasterSection gm={gm} pcsByOwner={state.pcsByOwner} />

          <PlayersSection
            players={activePlayers}
            pendingInvitations={state.pendingInvitations}
            pcsByOwner={state.pcsByOwner}
          />

          <div className="flex justify-end">
            <Link
              to={`/campaigns/${campaignId}/operations`}
              className={[
                'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
                'text-green-accent border border-green-mid bg-green-accent/[0.06]',
                'transition-all duration-150',
                'hover:bg-green-accent/[0.12] hover:border-green-bright',
                'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
              ].join(' ')}
            >
              Open campaign
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Game Master section                                                       */
/* -------------------------------------------------------------------------- */

function GameMasterSection({
  gm,
  pcsByOwner,
}: {
  gm: CampaignMemberWithProfile | null;
  pcsByOwner: Record<string, string>;
}) {
  return (
    <SectionShell title="Game Master">
      {gm ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="font-ui text-[14px] text-amber-dim"
            title="Handler"
          >
            ♛
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
              {gm.username ?? 'unknown handler'}
            </div>
            {pcsByOwner[gm.user_id] ? (
              <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px]">
                {pcsByOwner[gm.user_id]}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <SectionEmpty text="No handler assigned." />
      )}
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Players section (active + pending invites)                                */
/* -------------------------------------------------------------------------- */

function PlayersSection({
  players,
  pendingInvitations,
  pcsByOwner,
}: {
  players: CampaignMemberWithProfile[];
  pendingInvitations: PendingInvitationWithProfile[];
  pcsByOwner: Record<string, string>;
}) {
  const total = players.length + pendingInvitations.length;

  return (
    <SectionShell title="Players" count={total}>
      {total === 0 ? (
        <SectionEmpty text="No agents yet." />
      ) : (
        <ul>
          {players.map((m) => (
            <PlayerRow
              key={m.id}
              username={m.username}
              pcName={pcsByOwner[m.user_id] ?? null}
              badge="accepted"
            />
          ))}
          {pendingInvitations.map((i) => (
            <PlayerRow
              key={i.id}
              username={i.username ?? i.invitee_email}
              pcName={null}
              badge="invited"
            />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function PlayerRow({
  username,
  pcName,
  badge,
}: {
  username: string | null;
  pcName: string | null;
  badge: 'accepted' | 'invited';
}) {
  const handle = username ?? 'unknown agent';

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {handle}
        </div>
        {pcName ? (
          <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px]">
            {pcName}
          </div>
        ) : null}
      </div>
      <StatusBadge variant={badge} />
    </li>
  );
}

function StatusBadge({ variant }: { variant: 'accepted' | 'invited' }) {
  const label = variant === 'accepted' ? 'Accepted' : 'Invited';
  const classes =
    variant === 'accepted'
      ? 'text-green-mid border-green-dim/60'
      : 'text-amber-dim border-amber-dim/60';

  return (
    <span
      className={[
        'font-ui text-[9px] tracking-[0.16em] uppercase border px-[6px] py-[2px]',
        classes,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function SectionShell({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title}
        {typeof count === 'number' ? (
          <span className="text-green-mid"> · {count}</span>
        ) : null}
      </h2>
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
