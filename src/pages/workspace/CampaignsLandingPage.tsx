/**
 * Workspace landing page — campaign list + agent panel.
 *
 * Left column: the caller's active campaign memberships, grouped by role
 * ("As Handler" first, "As Agent" second). Each row is an "Open" affordance
 * routing to `/campaigns/:id/operations`. The empty state mirrors the
 * wireframe (dashed-border card, "Create campaign" CTA).
 *
 * Right column (DEL-65): the shared `<AgentRosterPanel>` rendering the
 * caller's full PC roster. Same component is reused at `/agents` in the
 * page-width variant. The earlier active-agent dropdown + "Open in roster"
 * placeholder is gone — the panel hosts the roster directly.
 *
 * Data:
 *   - `listMyMemberships()` returns membership rows joined with campaign
 *     rows and a pre-merged member count. The query is RLS-narrowed to
 *     `auth.uid()` rows already; the explicit `status = 'active'` filter
 *     and `campaign.deleted_at is null` join condition guard against
 *     soft-deleted campaigns and former memberships leaking through.
 *   - Roster-side data loading lives inside `AgentRosterPanel`.
 *
 * Stubs:
 *   - `Browse` is rendered as a disabled button with a `coming soon` tooltip
 *     per the issue's implementation notes. Real public browse lives in
 *     DEF-1 / DEL-?.
 */

import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useCallback, useEffect, useState } from 'react';

import { listMyMemberships } from '@/lib/campaigns';
import { RowMenu } from '@/components/common/RowMenu';
import { DeleteCampaignModal } from '@/components/manage/DeleteCampaignModal';
import { LeaveCampaignModal } from '@/components/workspace/LeaveCampaignModal';
import { LeaveLastHandlerModal } from '@/components/workspace/LeaveLastHandlerModal';
import { AgentRosterPanel } from '@/components/agents/AgentRosterPanel';
import { CampaignInfoPanel } from '@/components/workspace/CampaignInfoPanel';
import { useToast } from '@/contexts/ToastContext';
import type { CampaignMembership } from '@/types/campaigns';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; memberships: CampaignMembership[] };

type LeaveDialogState =
  | { kind: 'closed' }
  | { kind: 'leave'; campaignId: string; campaignName: string }
  | { kind: 'last_handler'; campaignName: string }
  | { kind: 'delete'; campaignId: string; campaignName: string };

/**
 * Left-column view-switch (DEL-69). Mirrors the `ViewMode` pattern in
 * `AgentRosterPanel`: default is the campaign list; clicking Info on a
 * card swaps the column to render `<CampaignInfoPanel>` for that
 * campaign. The fields beyond `campaignId` are carried in state so the
 * panel header paints from already-loaded data with no extra fetch.
 */
type PanelView =
  | { kind: 'list' }
  | {
      kind: 'info';
      campaignId: string;
      campaignName: string;
      memberCount: number;
      maxAgents: number;
      role: 'gm' | 'player';
    };

// DEL-80: CreateCampaignPage navigates here with this payload when the Handler
// picks "Info" from the post-create modal. Seeds the info panel directly so
// the just-created campaign's panel opens without a card-click round-trip.
type OpenInfoState = {
  openInfo?: {
    campaignId: string;
    campaignName: string;
    memberCount: number;
    maxAgents: number;
    role: 'gm' | 'player';
  };
};

export function CampaignsLandingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const openInfo = (location.state as OpenInfoState | null)?.openInfo;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<LeaveDialogState>({ kind: 'closed' });
  const [panelView, setPanelView] = useState<PanelView>(
    openInfo
      ? {
          kind: 'info',
          campaignId: openInfo.campaignId,
          campaignName: openInfo.campaignName,
          memberCount: openInfo.memberCount,
          maxAgents: openInfo.maxAgents,
          role: openInfo.role,
        }
      : { kind: 'list' },
  );
  const { showToast } = useToast();

  // Clear the consumed history state so a back/forward shuffle (or any later
  // re-render that re-reads location.state) doesn't re-open the panel after
  // the user has closed it.
  useEffect(() => {
    if (openInfo) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // Intentionally empty deps: this only needs to fire on mount. The values
    // above are captured once for the initial-state seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInfoRequest = useCallback(
    (
      campaignId: string,
      campaignName: string,
      memberCount: number,
      maxAgents: number,
      role: 'gm' | 'player',
    ) => {
      setPanelView({ kind: 'info', campaignId, campaignName, memberCount, maxAgents, role });
    },
    [],
  );

  const handleCloseInfo = useCallback(() => {
    setPanelView({ kind: 'list' });
  }, []);

  const reload = useCallback(async () => {
    const result = await listMyMemberships();
    if (!result.ok) {
      setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'ready', memberships: result.data });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listMyMemberships().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ready', memberships: result.data });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // DEL-74: intentionally not using `useCurrentCampaignRole` here — this
  // page iterates the user's memberships across every campaign to render
  // the "As Handler" / "As Agent" sections. The hook resolves a role within
  // a single `:campaignId` route segment, which the landing page doesn't
  // have, so it would return its idle state and answer the wrong question.
  const handlerMemberships =
    state.kind === 'ready' ? state.memberships.filter((m) => m.role === 'gm') : [];
  const agentMemberships =
    state.kind === 'ready' ? state.memberships.filter((m) => m.role === 'player') : [];
  const hasNoCampaigns =
    state.kind === 'ready' && handlerMemberships.length === 0 && agentMemberships.length === 0;

  const handleLeaveRequest = useCallback(
    (campaignId: string, campaignName: string) => {
      setDialog({ kind: 'leave', campaignId, campaignName });
    },
    [],
  );

  const handleLeft = useCallback(
    (campaignName: string) => {
      setDialog({ kind: 'closed' });
      showToast('success', `Left ${campaignName}.`);
      void reload();
    },
    [reload, showToast],
  );

  const handleIsHandler = useCallback((campaignName: string) => {
    setDialog({ kind: 'last_handler', campaignName });
  }, []);

  const handleDeleteRequest = useCallback(
    (campaignId: string, campaignName: string) => {
      setDialog({ kind: 'delete', campaignId, campaignName });
    },
    [],
  );

  const handleDeleted = useCallback(
    (campaignName: string) => {
      setDialog({ kind: 'closed' });
      showToast('success', `${campaignName} deleted.`);
      void reload();
    },
    [reload, showToast],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 items-stretch">
      <section className="lg:pr-8 lg:border-r lg:border-green-dim">
        {panelView.kind === 'info' ? (
          <CampaignInfoPanel
            campaignId={panelView.campaignId}
            campaignName={panelView.campaignName}
            memberCount={panelView.memberCount}
            maxAgents={panelView.maxAgents}
            role={panelView.role}
            onClose={handleCloseInfo}
          />
        ) : (
          <>
            <PageHeader />

            {state.kind === 'loading' ? <LoadingCard /> : null}
            {state.kind === 'error' ? <ErrorCard /> : null}
            {hasNoCampaigns ? <EmptyCampaignsCard /> : null}

            {state.kind === 'ready' && !hasNoCampaigns ? (
              <div className="flex flex-col gap-8">
                {handlerMemberships.length > 0 ? (
                  <MembershipsSection
                    title="As Handler"
                    count={handlerMemberships.length}
                    memberships={handlerMemberships}
                    onDeleteRequest={handleDeleteRequest}
                    onInfo={handleInfoRequest}
                  />
                ) : null}
                {agentMemberships.length > 0 ? (
                  <MembershipsSection
                    title="As Agent"
                    count={agentMemberships.length}
                    memberships={agentMemberships}
                    onLeaveRequest={handleLeaveRequest}
                    onInfo={handleInfoRequest}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <div className="lg:pl-8">
        <AgentRosterPanel />
      </div>

      {dialog.kind === 'leave' ? (
        <LeaveCampaignModal
          campaignId={dialog.campaignId}
          campaignName={dialog.campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
          onLeft={() => handleLeft(dialog.campaignName)}
          onIsHandler={() => handleIsHandler(dialog.campaignName)}
        />
      ) : null}

      {dialog.kind === 'last_handler' ? (
        <LeaveLastHandlerModal
          campaignName={dialog.campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
        />
      ) : null}

      {dialog.kind === 'delete' ? (
        <DeleteCampaignModal
          campaignId={dialog.campaignId}
          campaignName={dialog.campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
          onDeleted={() => handleDeleted(dialog.campaignName)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page header                                                               */
/* -------------------------------------------------------------------------- */

function PageHeader() {
  return (
    <header className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Campaigns
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Your handler groups and active operations
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Coming soon"
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[7px]',
            'text-green-mid border border-green-dim/60 bg-transparent',
            'cursor-not-allowed opacity-60',
          ].join(' ')}
        >
          Browse
        </button>
        <Link
          to="/campaigns/new"
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
          ].join(' ')}
        >
          + New campaign
        </Link>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Memberships section                                                       */
/* -------------------------------------------------------------------------- */

type MembershipsSectionProps = {
  title: string;
  count: number;
  memberships: CampaignMembership[];
  /**
   * Set on the "As Agent" section. Surfaces "Leave campaign" in the row
   * kebab on player cards.
   */
  onLeaveRequest?: (campaignId: string, campaignName: string) => void;
  /**
   * Set on the "As Handler" section. Surfaces "Delete campaign" in the row
   * kebab on Handler-owned cards. Settings page is the canonical surface;
   * this is the landing-page shortcut (DEL-48).
   */
  onDeleteRequest?: (campaignId: string, campaignName: string) => void;
  /**
   * Opens the Campaign Info Panel for this card (DEL-69). Bound on both
   * Handler and Agent sections so every card exposes Info.
   */
  onInfo: (
    campaignId: string,
    campaignName: string,
    memberCount: number,
    maxAgents: number,
    role: 'gm' | 'player',
  ) => void;
};

function MembershipsSection({
  title,
  count,
  memberships,
  onLeaveRequest,
  onDeleteRequest,
  onInfo,
}: MembershipsSectionProps) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {memberships.map((m) => (
          <CampaignCard
            key={m.campaign.id}
            membership={m}
            onLeaveRequest={onLeaveRequest}
            onDeleteRequest={onDeleteRequest}
            onInfo={onInfo}
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Campaign card                                                             */
/* -------------------------------------------------------------------------- */

function CampaignCard({
  membership,
  onLeaveRequest,
  onDeleteRequest,
  onInfo,
}: {
  membership: CampaignMembership;
  onLeaveRequest?: (campaignId: string, campaignName: string) => void;
  onDeleteRequest?: (campaignId: string, campaignName: string) => void;
  onInfo: (
    campaignId: string,
    campaignName: string,
    memberCount: number,
    maxAgents: number,
    role: 'gm' | 'player',
  ) => void;
}) {
  const { campaign, member_count, role } = membership;
  const roleLabel = role === 'gm' ? 'Handler' : 'Agent';
  const memberLabel = `${member_count} ${member_count === 1 ? 'member' : 'members'}`;
  // Player cards expose "Leave campaign" (DEL-47); Handler cards expose
  // "Delete campaign" (DEL-48). Only one action is reachable per role —
  // transfer-ownership (M-7c / DEL-49) will land in the Settings page, not
  // on the card.
  const menuAction: 'leave' | 'delete' | null =
    role === 'player' && onLeaveRequest
      ? 'leave'
      : role === 'gm' && onDeleteRequest
        ? 'delete'
        : null;

  return (
    <div className="border border-green-dim bg-desk-edge p-4 flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[15px] tracking-[0.12em] uppercase text-paper truncate">
            {campaign.name}
          </div>
          {campaign.codename ? (
            <div className="font-stamp text-[10px] tracking-[0.18em] uppercase text-amber-dim mt-[2px] truncate">
              {campaign.codename}
            </div>
          ) : null}
        </div>
        <div className="flex items-start gap-1 flex-shrink-0">
          <span className="font-ui text-[9px] tracking-[0.16em] uppercase text-green-mid border border-green-dim/60 px-[6px] py-[2px]">
            {roleLabel}
          </span>
          {menuAction ? (
            <RowMenu label={`Actions for ${campaign.name}`}>
              {(close) => (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    if (menuAction === 'leave') {
                      onLeaveRequest?.(campaign.id, campaign.name);
                    } else {
                      onDeleteRequest?.(campaign.id, campaign.name);
                    }
                  }}
                  className="dg-dropdown-item w-full text-left font-ui text-[10px] tracking-[0.14em] uppercase text-paper-worn px-3 py-[9px] hover:bg-red-faded/[0.08] hover:text-red-stamp transition-colors"
                >
                  {menuAction === 'leave' ? 'Leave campaign' : 'Delete campaign'}
                </button>
              )}
            </RowMenu>
          ) : null}
        </div>
      </div>

      <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-paper-dark/80 mt-auto">
        {memberLabel}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/campaigns/${campaign.id}/operations`}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px] text-center',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
          ].join(' ')}
        >
          Open
        </Link>
        <button
          type="button"
          onClick={() =>
            onInfo(campaign.id, campaign.name, member_count, campaign.max_agents, role)
          }
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px] text-center',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
          ].join(' ')}
        >
          Info
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading / error / empty                                                   */
/* -------------------------------------------------------------------------- */

function LoadingCard() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
        Loading dossier…
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/70 tracking-[0.1em] uppercase">
        Decrypting active memberships
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="border border-red-faded bg-red-faded/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-red-stamp text-sm uppercase tracking-widest">
        Transmission failed
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/80 tracking-[0.1em] uppercase">
        Could not load campaigns. Reload the page to retry.
      </div>
    </div>
  );
}

function EmptyCampaignsCard() {
  return (
    <div className="border border-dashed border-green-dim bg-desk-edge px-8 py-10 max-w-xl text-center flex flex-col items-center gap-3">
      <div className="font-display text-[18px] tracking-[0.18em] uppercase text-paper">
        No campaigns yet
      </div>
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/80 max-w-sm">
        Start one as a Handler, or wait for an invite.
      </p>
      <Link
        to="/campaigns/new"
        className={[
          'mt-2 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Create campaign
      </Link>
    </div>
  );
}

