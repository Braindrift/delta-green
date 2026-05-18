/**
 * Workspace landing page — campaign list.
 *
 * Left column: the caller's active campaign memberships, grouped by role
 * ("As Handler" first, "As Agent" second). Each row is an "Open" affordance
 * routing to `/campaigns/:id/operations`. The empty state mirrors the
 * wireframe (dashed-border card, "Create campaign" CTA).
 *
 * Right column: the Agent Panel (DEL-51). Minimal populated state — a
 * `<select>` listing the caller's PCs and an "Open in roster" link. Empty
 * state mirrors the campaigns column: dashed-border card prompting first
 * PC creation, with a CTA routing to `/agents`. The full stats display,
 * portrait, sheet view etc. land in DEF-2.
 *
 * Data:
 *   - `listMyMemberships()` returns membership rows joined with campaign
 *     rows and a pre-merged member count. The query is RLS-narrowed to
 *     `auth.uid()` rows already; the explicit `status = 'active'` filter
 *     and `campaign.deleted_at is null` join condition guard against
 *     soft-deleted campaigns and former memberships leaking through.
 *   - `listMyPlayerCharacters()` fetches the caller's non-deleted roster
 *     for the Agent Panel. Loading/error states render inline in the
 *     panel without blocking the rest of the page.
 *   - States exposed: loading → error → empty → populated. Loading shows
 *     a stamped placeholder so the chrome doesn't visibly reflow.
 *
 * Stubs:
 *   - `Browse` is rendered as a disabled button with a `coming soon` tooltip
 *     per the issue's implementation notes. Real public browse lives in
 *     DEF-1 / DEL-?.
 */

import { Link } from 'react-router-dom';

import { useCallback, useEffect, useState } from 'react';

import { listMyMemberships } from '@/lib/campaigns';
import { listMyPlayerCharacters } from '@/lib/player-characters';
import { RowMenu } from '@/components/common/RowMenu';
import { LeaveCampaignModal } from '@/components/workspace/LeaveCampaignModal';
import { LeaveLastHandlerModal } from '@/components/workspace/LeaveLastHandlerModal';
import { useToast } from '@/contexts/ToastContext';
import type { CampaignMembership } from '@/types/campaigns';
import type { PlayerCharacterWithCampaign } from '@/types/player-characters';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; memberships: CampaignMembership[] };

type LeaveDialogState =
  | { kind: 'closed' }
  | { kind: 'leave'; campaignId: string; campaignName: string }
  | { kind: 'last_handler'; campaignName: string };

export function CampaignsLandingPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<LeaveDialogState>({ kind: 'closed' });
  const { showToast } = useToast();

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

  return (
    <div className="flex gap-8 items-start">
      <section className="flex-1 min-w-0">
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
              />
            ) : null}
            {agentMemberships.length > 0 ? (
              <MembershipsSection
                title="As Agent"
                count={agentMemberships.length}
                memberships={agentMemberships}
                onLeaveRequest={handleLeaveRequest}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <AgentPanelPlaceholder />

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
   * Only set on the "As Agent" section. When undefined the section renders
   * cards without the kebab — used for "As Handler".
   */
  onLeaveRequest?: (campaignId: string, campaignName: string) => void;
};

function MembershipsSection({
  title,
  count,
  memberships,
  onLeaveRequest,
}: MembershipsSectionProps) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {memberships.map((m) => (
          <CampaignCard
            key={m.campaign.id}
            membership={m}
            onLeaveRequest={onLeaveRequest}
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
}: {
  membership: CampaignMembership;
  onLeaveRequest?: (campaignId: string, campaignName: string) => void;
}) {
  const { campaign, member_count, role } = membership;
  const roleLabel = role === 'gm' ? 'Handler' : 'Agent';
  const memberLabel = `${member_count} ${member_count === 1 ? 'member' : 'members'}`;
  // The kebab only appears for player memberships. Handler cards never
  // get a leave affordance — transfer/delete live elsewhere (M-7b/c).
  const showLeaveMenu = role === 'player' && Boolean(onLeaveRequest);

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
          {showLeaveMenu ? (
            <RowMenu label={`Actions for ${campaign.name}`}>
              {(close) => (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onLeaveRequest?.(campaign.id, campaign.name);
                  }}
                  className="dg-dropdown-item w-full text-left font-ui text-[10px] tracking-[0.14em] uppercase text-paper-worn px-3 py-[9px] hover:bg-red-faded/[0.08] hover:text-red-stamp transition-colors"
                >
                  Leave campaign
                </button>
              )}
            </RowMenu>
          ) : null}
        </div>
      </div>

      <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-paper-dark/80 mt-auto">
        {memberLabel}
      </div>

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

/* -------------------------------------------------------------------------- */
/*  Right column — Agent Panel (DEL-51, minimum viable)                       */
/* -------------------------------------------------------------------------- */

type PanelState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; pcs: PlayerCharacterWithCampaign[] };

function AgentPanelPlaceholder() {
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listMyPlayerCharacters().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ready', pcs: result.data });
      // Default selection is the first PC. Selection is transient — DEF-2
      // will introduce a persisted "active" pointer; v1 doesn't need it.
      if (result.data.length > 0) setSelectedId(result.data[0].id);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="w-[340px] flex-shrink-0 border border-green-dim/60 bg-desk-edge p-5">
      <div className="font-display text-[12px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        Agent Panel
      </div>

      {state.kind === 'loading' ? (
        <div className="font-ui text-[10px] tracking-[0.12em] uppercase text-green-mid">
          Loading roster…
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="font-ui text-[11px] tracking-[0.04em] text-red-stamp leading-relaxed">
          Could not load your agents.
        </div>
      ) : null}

      {state.kind === 'ready' && state.pcs.length === 0 ? (
        <AgentPanelEmpty />
      ) : null}

      {state.kind === 'ready' && state.pcs.length > 0 ? (
        <AgentPanelPopulated
          pcs={state.pcs}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : null}
    </aside>
  );
}

function AgentPanelEmpty() {
  return (
    <div className="border border-dashed border-green-dim bg-transparent px-4 py-5 text-center flex flex-col items-center gap-2">
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/80">
        No agents on file. Create your first agent. They'll be linked to a campaign when you join one.
      </p>
      <Link
        to="/agents"
        className={[
          'mt-2 font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[7px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Create agent
      </Link>
    </div>
  );
}

function AgentPanelPopulated({
  pcs,
  selectedId,
  onSelect,
}: {
  pcs: PlayerCharacterWithCampaign[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor="agent-panel-select"
        className="font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase"
      >
        Active agent
      </label>
      <select
        id="agent-panel-select"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className={[
          'w-full font-body text-[13px] text-paper bg-desk-groove',
          'border border-green-dim px-3 py-[8px] tracking-[0.04em]',
          'focus:outline-none focus:border-green-mid focus:bg-green-void',
          'transition-colors duration-150',
        ].join(' ')}
      >
        {pcs.map((pc) => (
          <option key={pc.id} value={pc.id}>
            {pc.name} · {pc.status}
          </option>
        ))}
      </select>
      <Link
        to="/agents"
        className={[
          'self-start font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[7px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Open in roster
      </Link>
    </div>
  );
}
