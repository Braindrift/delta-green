/**
 * Workspace — Agents roster (DEL-51).
 *
 * Minimal viable PC management. Two sections grouped by campaign attachment:
 *   - "Unassigned · N"   — PCs with `campaign_id is null`.
 *   - "In campaigns · N" — PCs attached to a campaign.
 *
 * Per-row affordances live in a kebab menu: Edit / Retire / Delete. Delete
 * is disabled (with an explanatory tooltip) for attached PCs — per DoD, an
 * attached PC must be retired, not deleted, so the campaign-side history
 * stays intact.
 *
 * Modals:
 *   - Create / edit use `AgentForm` inside `ModalShell`. The form is
 *     intentionally extractable — DEL-46's accept-invite PC-picker drops
 *     the same component inline.
 *   - Retire / Delete are local confirmation modals (two-button, success
 *     copies into a toast). The "Delete only when unassigned" rule lives
 *     at the row affordance — by the time the confirm modal opens, the
 *     status is already known to be unassigned.
 *
 * Stats UI, portrait, bonds, sheet view, multi-PC swap, deceased/recovery
 * are deferred to DEF-2.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '@/contexts/ToastContext';
import {
  listMyPlayerCharacters,
  retirePlayerCharacter,
  softDeletePlayerCharacter,
} from '@/lib/player-characters';
import type {
  PlayerCharacterStatus,
  PlayerCharacterWithCampaign,
} from '@/types/player-characters';
import { AgentForm } from '@/components/agents/AgentForm';
import { ModalShell } from '@/components/manage/ModalShell';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; pcs: PlayerCharacterWithCampaign[] };

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; pc: PlayerCharacterWithCampaign }
  | { kind: 'retire'; pc: PlayerCharacterWithCampaign }
  | { kind: 'delete'; pc: PlayerCharacterWithCampaign };

export function WorkspaceAgentsPage() {
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
    // Match the deferred-microtask pattern used by `ManageMembersPage` so
    // the `setState({ kind: 'loading' })` inside `reload` doesn't sit on
    // the same tick as the effect body.
    void Promise.resolve().then(() => reload());
  }, [reload]);

  const unassigned = useMemo(
    () => (state.kind === 'ready' ? state.pcs.filter((p) => p.campaign_id === null) : []),
    [state],
  );
  const inCampaigns = useMemo(
    () => (state.kind === 'ready' ? state.pcs.filter((p) => p.campaign_id !== null) : []),
    [state],
  );

  const isReady = state.kind === 'ready';
  const isEmpty = isReady && unassigned.length === 0 && inCampaigns.length === 0;

  return (
    <section>
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
            Agents
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            Your player characters
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDialog({ kind: 'create' })}
          disabled={!isReady}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          + Create agent
        </button>
      </header>

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
            onEdit={(pc) => setDialog({ kind: 'edit', pc })}
            onRetire={(pc) => setDialog({ kind: 'retire', pc })}
            onDelete={(pc) => setDialog({ kind: 'delete', pc })}
          />
          <PcSection
            title="In campaigns"
            count={inCampaigns.length}
            pcs={inCampaigns}
            emptyText="No agents are currently deployed."
            onEdit={(pc) => setDialog({ kind: 'edit', pc })}
            onRetire={(pc) => setDialog({ kind: 'retire', pc })}
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

      {dialog.kind === 'edit' ? (
        <ModalShell
          title="Edit agent"
          subtitle={dialog.pc.name}
          onClose={() => setDialog({ kind: 'closed' })}
          width={520}
        >
          <AgentForm
            mode={{ kind: 'edit', pc: dialog.pc }}
            onCancel={() => setDialog({ kind: 'closed' })}
            onSubmitted={() => {
              setDialog({ kind: 'closed' });
              showToast('success', 'Agent updated.');
              void reload();
            }}
          />
        </ModalShell>
      ) : null}

      {dialog.kind === 'retire' ? (
        <RetireConfirmModal
          pc={dialog.pc}
          onClose={() => setDialog({ kind: 'closed' })}
          onConfirmed={() => {
            setDialog({ kind: 'closed' });
            showToast('success', 'Agent retired.');
            void reload();
          }}
        />
      ) : null}

      {dialog.kind === 'delete' ? (
        <DeleteConfirmModal
          pc={dialog.pc}
          onClose={() => setDialog({ kind: 'closed' })}
          onConfirmed={() => {
            setDialog({ kind: 'closed' });
            showToast('success', 'Agent deleted.');
            void reload();
          }}
        />
      ) : null}
    </section>
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
  onEdit: (pc: PlayerCharacterWithCampaign) => void;
  onRetire: (pc: PlayerCharacterWithCampaign) => void;
  onDelete: (pc: PlayerCharacterWithCampaign) => void;
};

function PcSection({
  title,
  count,
  pcs,
  emptyText,
  onEdit,
  onRetire,
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
                onEdit={() => onEdit(pc)}
                onRetire={() => onRetire(pc)}
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
  onEdit,
  onRetire,
  onDelete,
}: {
  pc: PlayerCharacterWithCampaign;
  onEdit: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  const attached = pc.campaign_id !== null;
  const canDelete = pc.status === 'unassigned' && !attached;

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {pc.name}
        </div>
        <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px] truncate">
          {pc.archetype ?? '—'}
          {attached && pc.campaign ? (
            <>
              {' · '}
              <span className="text-paper-worn">{pc.campaign.name}</span>
            </>
          ) : null}
        </div>
      </div>
      <StatusBadge status={pc.status} />
      <RowMenu label={`Actions for ${pc.name}`}>
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                onEdit();
              }}
            >
              Edit
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                onRetire();
              }}
              disabled={pc.status === 'retired' || pc.status === 'deceased'}
              disabledHint={
                pc.status === 'retired'
                  ? 'Already retired'
                  : pc.status === 'deceased'
                    ? 'This agent is deceased'
                    : undefined
              }
            >
              Retire
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                onDelete();
              }}
              disabled={!canDelete}
              disabledHint={
                attached
                  ? 'Retire instead — attached to a campaign'
                  : pc.status !== 'unassigned'
                    ? 'Only unassigned agents can be deleted'
                    : undefined
              }
              tone="danger"
            >
              Delete
            </MenuItem>
          </>
        )}
      </RowMenu>
    </li>
  );
}

function StatusBadge({ status }: { status: PlayerCharacterStatus }) {
  const label = STATUS_LABELS[status];
  return (
    <span className="font-ui text-[9px] tracking-[0.16em] uppercase text-green-mid border border-green-dim/60 px-[6px] py-[2px] flex-shrink-0">
      {label}
    </span>
  );
}

const STATUS_LABELS: Record<PlayerCharacterStatus, string> = {
  unassigned: 'Unassigned',
  active: 'Active',
  retired: 'Retired',
  deceased: 'Deceased',
  former: 'Former',
};

/* -------------------------------------------------------------------------- */
/*  Empty / loading / error                                                   */
/* -------------------------------------------------------------------------- */

function EmptyRosterCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-green-dim bg-desk-edge px-8 py-10 max-w-xl text-center flex flex-col items-center gap-3">
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
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4 max-w-xl">
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
    <div className="border border-red-faded bg-red-faded/10 px-5 py-4 max-w-xl">
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
/*  Retire / Delete confirm modals                                            */
/* -------------------------------------------------------------------------- */

function RetireConfirmModal({
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

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await retirePlayerCharacter(pc.id);
    setSubmitting(false);
    if (!result.ok) {
      setError('Could not retire this agent. Try again.');
      return;
    }
    onConfirmed();
  }

  return (
    <ModalShell
      title="Retire agent"
      subtitle="Preserves campaign history"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        Retire <span className="text-paper">{pc.name}</span>?
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        They will be marked retired and kept on file. If they are attached to a
        campaign, the attachment is preserved.
      </p>

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
          className={primaryConfirmClass}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
              />
              Retiring…
            </>
          ) : (
            'Retire'
          )}
        </button>
      </div>
    </ModalShell>
  );
}

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

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await softDeletePlayerCharacter(pc.id);
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
      subtitle="Removes from roster"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
        Delete <span className="text-paper">{pc.name}</span> from your roster?
      </p>

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
/*  Row menu (kebab) — mirrors ManageMembersPage                              */
/* -------------------------------------------------------------------------- */

function RowMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useMenuOutsideClose(setOpen, open);

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'font-ui text-[14px] leading-none text-paper-dark hover:text-paper',
          'border border-transparent hover:border-green-dim/60',
          'w-[28px] h-[24px] flex items-center justify-center transition-colors',
        ].join(' ')}
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 min-w-[220px] z-[50] flex flex-col overflow-hidden border border-green-mid bg-desk-edge"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  disabled = false,
  disabledHint,
  tone = 'default',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
}) {
  const base =
    'dg-dropdown-item w-full text-left font-ui text-[10px] tracking-[0.14em] uppercase px-3 py-[9px] transition-colors';
  const enabledTone =
    tone === 'danger'
      ? 'text-paper-worn hover:bg-red-faded/[0.08] hover:text-red-stamp'
      : 'text-paper-worn hover:bg-green-accent/[0.08] hover:text-paper';
  const disabledTone = 'text-green-mid/50 cursor-not-allowed';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={[base, disabled ? disabledTone : enabledTone].join(' ')}
    >
      {children}
    </button>
  );
}

function useMenuOutsideClose(setOpen: (v: boolean) => void, open: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

/* -------------------------------------------------------------------------- */
/*  Shared button classes                                                     */
/* -------------------------------------------------------------------------- */

const cancelButtonClass = [
  'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
  'text-green-mid border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

const primaryConfirmClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'cursor-pointer transition-all duration-150',
  'flex items-center gap-2',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
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
