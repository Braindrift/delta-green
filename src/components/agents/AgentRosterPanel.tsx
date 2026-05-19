/**
 * Shared agent-roster panel (DEL-65).
 *
 * Renders the caller's player-character roster — `Unassigned · N` and
 * `In Campaigns · N` sections grouped on `campaign_status` — with a
 * `+ New Agent` header affordance. Used in two places:
 *
 *   - Landing page right column (`variant="landing"`) — replaces the old
 *     "active-agent dropdown + open in roster" placeholder.
 *   - Standalone `/agents` page (`variant="page"`) — full-width, larger
 *     heading. Section content is identical to the landing-page variant.
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
import {
  listMyPlayerCharacters,
  migratePlayerCharacterToNpc,
} from '@/lib/player-characters';
import type {
  PlayerCharacterStatus,
  PlayerCharacterWithCampaign,
} from '@/types/player-characters';
import { AgentForm } from '@/components/agents/AgentForm';
import { ModalShell } from '@/components/manage/ModalShell';
import { RowMenu } from '@/components/common/RowMenu';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; pcs: PlayerCharacterWithCampaign[] };

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'delete'; pc: PlayerCharacterWithCampaign };

export type AgentRosterPanelVariant = 'landing' | 'page';

export function AgentRosterPanel({ variant }: { variant: AgentRosterPanelVariant }) {
  const { showToast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });

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

  const isReady = state.kind === 'ready';
  const isEmpty = isReady && unassigned.length === 0 && assigned.length === 0;

  const wrapperClass =
    variant === 'landing'
      ? 'border border-green-dim/60 bg-desk-edge p-5'
      : '';

  return (
    <section className={wrapperClass}>
      <Header
        variant={variant}
        disabled={!isReady}
        onCreate={() => setDialog({ kind: 'create' })}
      />

      {state.kind === 'loading' ? <LoadingCard /> : null}
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
            onDelete={(pc) => setDialog({ kind: 'delete', pc })}
          />
          <PcSection
            title="In Campaigns"
            count={assigned.length}
            pcs={assigned}
            emptyText="No agents are currently deployed."
            onDelete={(pc) => setDialog({ kind: 'delete', pc })}
          />
        </div>
      ) : null}

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
  variant,
  disabled,
  onCreate,
}: {
  variant: AgentRosterPanelVariant;
  disabled: boolean;
  onCreate: () => void;
}) {
  if (variant === 'page') {
    return (
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
            Agents
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            Your player characters
          </p>
        </div>
        <NewAgentButton disabled={disabled} onClick={onCreate} />
      </header>
    );
  }

  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="font-display text-[12px] font-light tracking-[0.22em] uppercase text-paper-worn">
        Agent Panel
      </div>
      <NewAgentButton disabled={disabled} onClick={onCreate} />
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
  onDelete: (pc: PlayerCharacterWithCampaign) => void;
};

function PcSection({ title, count, pcs, emptyText, onDelete }: PcSectionProps) {
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
              <PcRow key={pc.id} pc={pc} onDelete={() => onDelete(pc)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PcRow({
  pc,
  onDelete,
}: {
  pc: PlayerCharacterWithCampaign;
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
          onClick={() => {
            // TODO(DEL-67): open assign-to-campaign dialog.
          }}
          className={rowSecondaryButtonClass}
        >
          Assign
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          // TODO(DEL-66): open Agent Info View for this PC.
        }}
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