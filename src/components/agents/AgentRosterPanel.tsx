/**
 * Shared agent-roster panel (DEL-65).
 *
 * Renders the caller's player-character roster — `Unassigned · N` and
 * `In Campaigns · N` sections grouped on `campaign_status` — with a
 * `+ New Agent` header affordance. Used in two places:
 *
 *   - Landing page right column, paired with the Campaigns column to its
 *     left (visually divided in `CampaignsLandingPage`).
 *   - Standalone `/agents` page, full-width.
 *
 * Both surfaces share the same `AGENTS` heading + `Your dossier of
 * player characters` subtitle so the landing-page pair reads as two
 * halves of one desk (DEL-66 visual polish).
 *
 * Per-row affordances follow the post-DEL-32 design review (rows 6/7 of
 * `AgentPanel.png`):
 *
 *   - Row 6 (unassigned): NAME · [STATUS] · *archetype, then [ASSIGN],
 *     [OPEN], `⋯`. ASSIGN stubs into DEL-67.
 *   - Row 7 (assigned):   NAME · [STATUS] · *archetype, then [CAMPAIGN]
 *     (Link → `/campaigns/:id/operations`), [OPEN], `⋯`.
 *
 * The `⋯` kebab carries a single action — DELETE — wired to the existing
 * PC → NPC delete flow from DEL-63 (`migratePlayerCharacterToNpc`). Edit
 * folds into [OPEN] (DEL-66 AIV) and Retire moves to the AIV; both
 * disappear from the kebab here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useToast } from '@/contexts/ToastContext';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import {
  listMyPlayerCharacters,
  migratePlayerCharacterToNpc,
} from '@/lib/player-characters';
import type {
  PlayerCharacterStatus,
  PlayerCharacterWithCampaign,
} from '@/types/player-characters';
import { AgentForm } from '@/components/agents/AgentForm';
import { AgentInfoView } from '@/components/agents/AgentInfoView';
import { AssignToCampaignModal } from '@/components/agents/AssignToCampaignModal';
import { ModalShell } from '@/components/common/ModalShell';
import { RowMenu } from '@/components/common/RowMenu';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; pcs: PlayerCharacterWithCampaign[] };

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'assign'; pc: PlayerCharacterWithCampaign }
  | { kind: 'delete'; pc: PlayerCharacterWithCampaign };

/**
 * Panel body view-switching (DEL-66). The roster view is the default; OPEN
 * on a row promotes the panel into the Agent Info View for that PC. BACK
 * returns to the roster. State is local — refreshing the page returns to
 * the roster (URL-based deep linking is DEL-53 territory).
 */
type ViewMode = { kind: 'roster' } | { kind: 'info'; pcId: string };

export function AgentRosterPanel() {
  const { showToast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [viewMode, setViewMode] = useState<ViewMode>({ kind: 'roster' });

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await listMyPlayerCharacters();
    if (!result.ok) {
      setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'ready', pcs: result.data });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => reload());
  }, [reload]);

  // DEL-82: suppress the "Loading roster…" flash on fast loads.
  const showLoading = useDelayedFlag(state.kind === 'loading');

  const unassigned = useMemo(
    () =>
      state.kind === 'ready'
        ? state.pcs.filter((p) => p.campaign_status === 'unassigned')
        : [],
    [state],
  );
  const assigned = useMemo(
    () =>
      state.kind === 'ready'
        ? state.pcs.filter((p) => p.campaign_status === 'assigned')
        : [],
    [state],
  );

  // Campaigns where the owner already has a PC attached. Passed to the
  // assign dialog so it can filter the eligible-memberships dropdown
  // without re-fetching the roster. Stable reference across renders so
  // the modal's effect doesn't re-run on every parent state tick.
  const attachedCampaignIds = useMemo(() => {
    if (state.kind !== 'ready') return new Set<string>();
    const ids = new Set<string>();
    for (const pc of state.pcs) {
      if (pc.campaign_id) ids.add(pc.campaign_id);
    }
    return ids;
  }, [state]);

  const isReady = state.kind === 'ready';
  const isEmpty = isReady && unassigned.length === 0 && assigned.length === 0;

  // If we're in info mode but the PC vanished from the roster after a
  // reload (deleted in another tab, etc.), fall back to the roster view
  // so the panel doesn't render an empty AIV. `viewMode` itself stays on
  // 'info' until the user takes an action — harmless because rendering
  // is driven by `showRoster`.
  const activePc =
    viewMode.kind === 'info' && isReady
      ? state.pcs.find((p) => p.id === viewMode.pcId) ?? null
      : null;

  const showRoster = viewMode.kind === 'roster' || !activePc;

  return (
    <section>
      <Header
        disabled={!isReady}
        onCreate={() => setDialog({ kind: 'create' })}
        showCreate={showRoster}
      />

      {showRoster ? (
        <>
          {state.kind === 'loading' && showLoading ? <LoadingCard /> : null}
          {state.kind === 'error' ? <ErrorCard onRetry={() => void reload()} /> : null}

          {isReady && isEmpty ? (
            <EmptyRosterCard onCreate={() => setDialog({ kind: 'create' })} />
          ) : null}

          {isReady && !isEmpty ? (
            <div className="flex flex-col gap-8">
              <PcSection
                title="Unassigned"
                count={unassigned.length}
                pcs={unassigned}
                emptyText="No unassigned agents. Join a campaign or retire an existing one."
                onOpen={(pc) => setViewMode({ kind: 'info', pcId: pc.id })}
                onAssign={(pc) => setDialog({ kind: 'assign', pc })}
                onDelete={(pc) => setDialog({ kind: 'delete', pc })}
              />
              <PcSection
                title="In Campaigns"
                count={assigned.length}
                pcs={assigned}
                emptyText="No agents are currently deployed."
                onOpen={(pc) => setViewMode({ kind: 'info', pcId: pc.id })}
                onAssign={(pc) => setDialog({ kind: 'assign', pc })}
                onDelete={(pc) => setDialog({ kind: 'delete', pc })}
              />
            </div>
          ) : null}
        </>
      ) : (
        <AgentInfoView
          pc={activePc!}
          onBack={() => setViewMode({ kind: 'roster' })}
          onMutated={() => void reload()}
        />
      )}

      {dialog.kind === 'create' ? (
        <ModalShell
          title="New agent"
          subtitle="File a new player character"
          onClose={() => setDialog({ kind: 'closed' })}
          width={520}
        >
          <AgentForm
            mode={{ kind: 'create' }}
            onCancel={() => setDialog({ kind: 'closed' })}
            onSubmitted={() => {
              setDialog({ kind: 'closed' });
              showToast('success', 'Agent created.');
              void reload();
            }}
          />
        </ModalShell>
      ) : null}

      {dialog.kind === 'assign' ? (
        <AssignToCampaignModal
          pc={dialog.pc}
          attachedCampaignIds={attachedCampaignIds}
          onClose={() => setDialog({ kind: 'closed' })}
          onAssigned={(campaignName) => {
            setDialog({ kind: 'closed' });
            showToast('success', `Agent assigned to ${campaignName}.`);
            void reload();
          }}
        />
      ) : null}

      {dialog.kind === 'delete' ? (
        <DeleteConfirmModal
          pc={dialog.pc}
          onClose={() => setDialog({ kind: 'closed' })}
          onConfirmed={() => {
            const wasAttached = dialog.pc.campaign_status === 'assigned';
            const campaignName = dialog.pc.campaign?.name ?? 'the campaign';
            setDialog({ kind: 'closed' });
            showToast(
              'success',
              wasAttached
                ? `Agent transferred to ${campaignName} as NPC.`
                : 'Agent deleted from roster.',
            );
            void reload();
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                    */
/* -------------------------------------------------------------------------- */

function Header({
  disabled,
  onCreate,
  showCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
  /** Hide the `+ New Agent` button when the panel is showing the AIV
   *  rather than the roster — creating from inside another PC's dossier
   *  is confusing UX. */
  showCreate: boolean;
}) {
  return (
    <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Agents
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Your dossier of player characters
        </p>
      </div>
      {showCreate ? <NewAgentButton disabled={disabled} onClick={onCreate} /> : null}
    </header>
  );
}

function NewAgentButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
        'text-green-accent border border-green-mid bg-green-accent/[0.06]',
        'transition-all duration-150',
        'hover:bg-green-accent/[0.12] hover:border-green-bright',
        'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      + New Agent
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section + rows                                                            */
/* -------------------------------------------------------------------------- */

type PcSectionProps = {
  title: string;
  count: number;
  pcs: PlayerCharacterWithCampaign[];
  emptyText: string;
  onOpen: (pc: PlayerCharacterWithCampaign) => void;
  onAssign: (pc: PlayerCharacterWithCampaign) => void;
  onDelete: (pc: PlayerCharacterWithCampaign) => void;
};

function PcSection({
  title,
  count,
  pcs,
  emptyText,
  onOpen,
  onAssign,
  onDelete,
}: PcSectionProps) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <div className="border border-green-dim bg-desk-edge">
        {pcs.length === 0 ? (
          <div className="px-4 py-5 font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
            {emptyText}
          </div>
        ) : (
          <ul>
            {pcs.map((pc) => (
              <PcRow
                key={pc.id}
                pc={pc}
                onOpen={() => onOpen(pc)}
                onAssign={() => onAssign(pc)}
                onDelete={() => onDelete(pc)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PcRow({
  pc,
  onOpen,
  onAssign,
  onDelete,
}: {
  pc: PlayerCharacterWithCampaign;
  onOpen: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const isAssigned = pc.campaign_status === 'assigned';

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0 flex-wrap">
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {pc.name}
        </span>
        <StatusPill status={pc.status} />
        <span className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid truncate">
          *{pc.archetype ?? '—'}
        </span>
      </div>

      {isAssigned && pc.campaign ? (
        <Link
          to={`/campaigns/${pc.campaign.id}/operations`}
          className={campaignLinkClass}
          title={`Open ${pc.campaign.name}`}
        >
          {pc.campaign.name}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onAssign}
          className={rowSecondaryButtonClass}
        >
          Assign
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className={rowPrimaryButtonClass}
      >
        Open
      </button>

      <RowMenu label={`Actions for ${pc.name}`}>
        {(close) => (
          <button
            type="button"
            onClick={() => {
              close();
              onDelete();
            }}
            className="dg-dropdown-item w-full text-left font-ui text-[10px] tracking-[0.14em] uppercase text-paper-worn px-3 py-[9px] hover:bg-red-faded/[0.08] hover:text-red-stamp transition-colors"
          >
            Delete
          </button>
        )}
      </RowMenu>
    </li>
  );
}

function StatusPill({ status }: { status: PlayerCharacterStatus }) {
  return (
    <span className="font-ui text-[9px] tracking-[0.16em] uppercase text-green-mid border border-green-dim/60 px-[6px] py-[2px] flex-shrink-0">
      {STATUS_PILL_LABELS[status]}
    </span>
  );
}

const STATUS_PILL_LABELS: Record<PlayerCharacterStatus, string> = {
  active: 'Active',
  retired: 'Retired',
  deceased: 'Dead',
};

/* -------------------------------------------------------------------------- */
/*  Empty / loading / error                                                   */
/* -------------------------------------------------------------------------- */

function EmptyRosterCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-green-dim bg-desk-edge px-8 py-10 text-center flex flex-col items-center gap-3">
      <div className="font-display text-[18px] tracking-[0.18em] uppercase text-paper">
        No agents on file
      </div>
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/80 max-w-sm">
        Create your first agent. They'll be linked to a campaign when you join one.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className={[
          'mt-2 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Create first agent
      </button>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4">
      <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
        Loading roster…
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/70 tracking-[0.1em] uppercase">
        Decrypting agent files
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
        Could not load the roster.
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
/*  Delete confirm modal                                                      */
/* -------------------------------------------------------------------------- */

function DeleteConfirmModal({
  pc,
  onClose,
  onConfirmed,
}: {
  pc: PlayerCharacterWithCampaign;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAssigned = pc.campaign_status === 'assigned';
  const campaignName = pc.campaign?.name ?? 'the campaign';

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await migratePlayerCharacterToNpc(pc.id);
    setSubmitting(false);
    if (!result.ok) {
      setError('Could not delete this agent. Try again.');
      return;
    }
    onConfirmed();
  }

  return (
    <ModalShell
      title="Delete agent"
      subtitle={isAssigned ? 'Hands over to Handler' : 'Removes from roster'}
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      {isAssigned ? (
        <>
          <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
            Delete <span className="text-paper">{pc.name}</span> from your roster?
          </p>
          <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
            Removes this agent from your roster permanently. They will
            continue to exist in{' '}
            <span className="text-paper-worn">{campaignName}</span> as an
            NPC under the Handler&rsquo;s control. This cannot be undone.
          </p>
        </>
      ) : (
        <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
          Delete <span className="text-paper">{pc.name}</span> from your
          roster? This cannot be undone.
        </p>
      )}

      {error ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Action failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {error}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={cancelButtonClass}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={dangerConfirmClass}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-red-stamp dg-status-dot"
              />
              Deleting…
            </>
          ) : (
            'Delete'
          )}
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared button classes                                                     */
/* -------------------------------------------------------------------------- */

const rowPrimaryButtonClass = [
  'font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[6px] flex-shrink-0',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
].join(' ');

const rowSecondaryButtonClass = [
  'font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[6px] flex-shrink-0',
  'text-paper-worn border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
].join(' ');

const campaignLinkClass = [
  'font-ui text-[10px] tracking-[0.18em] uppercase px-3 py-[6px] flex-shrink-0 max-w-[180px] truncate',
  'text-paper-worn border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
].join(' ');

const cancelButtonClass = [
  'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
  'text-green-mid border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

const dangerConfirmClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
  'cursor-pointer transition-all duration-150',
  'hover:bg-red-faded/[0.16] hover:shadow-[0_0_12px_rgba(170,80,80,0.18)]',
  'focus:outline-none focus:border-red-stamp',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
  'flex items-center gap-2',
].join(' ');