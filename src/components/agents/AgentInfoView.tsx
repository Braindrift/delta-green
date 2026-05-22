/**
 * Agent Info View (DEL-66) — single-PC dossier rendered inside the
 * `AgentRosterPanel` panel slot. Replaces the roster body when OPEN is
 * clicked on a row.
 *
 * Scope is intentionally mockup-quality: the only real fields are the
 * three already supported by DEL-51 — `name`, `archetype`, `notes`. The
 * full character sheet (stats, bonds, motivations, portrait upload,
 * death/recovery flows) is DEL-53's territory and is rendered here as
 * placeholder copy.
 *
 * Edit pattern: AIV defaults to a read-only display of the three fields.
 * An Edit button promotes the dossier into edit mode, swapping the
 * displays for inputs and revealing Save / Cancel actions. Save commits
 * all three fields in one `updatePlayerCharacter` call. (OPEN is for
 * viewing; editing is a deliberate sub-action.)
 *
 * Retire: separate confirm modal, only offered when `status === 'active'`.
 * Calls `retirePlayerCharacter`. The status pill flips on success; the
 * AIV stays open so the user can see the new state before hitting BACK.
 */

import { useState } from 'react';

import { useToast } from '@/contexts/ToastContext';
import {
  retirePlayerCharacter,
  updatePlayerCharacter,
} from '@/lib/player-characters';
import type {
  PlayerCharacter,
  PlayerCharacterStatus,
} from '@/types/player-characters';
import { ModalShell } from '@/components/common/ModalShell';

export type AgentInfoViewProps = {
  pc: PlayerCharacter;
  onBack: () => void;
  /** Called after a successful edit or retire so the parent can refresh
   *  its roster snapshot. The AIV will keep showing the updated PC. */
  onMutated: () => void;
};

export function AgentInfoView({ pc, onBack, onMutated }: AgentInfoViewProps) {
  const { showToast } = useToast();

  const currentName = pc.name;
  const currentArchetype = pc.archetype ?? '';
  const currentNotes = pc.data?.notes ?? '';

  type Mode =
    | { kind: 'viewing' }
    | {
        kind: 'editing';
        name: string;
        archetype: string;
        notes: string;
        nameError: string | null;
        saveError: string | null;
        saving: boolean;
      };

  const [mode, setMode] = useState<Mode>({ kind: 'viewing' });
  const [retireOpen, setRetireOpen] = useState(false);

  function beginEdit() {
    setMode({
      kind: 'editing',
      name: currentName,
      archetype: currentArchetype,
      notes: currentNotes,
      nameError: null,
      saveError: null,
      saving: false,
    });
  }

  function cancelEdit() {
    setMode({ kind: 'viewing' });
  }

  async function handleSave() {
    if (mode.kind !== 'editing' || mode.saving) return;
    const trimmedName = mode.name.trim();
    if (trimmedName === '') {
      setMode({ ...mode, nameError: 'Name is required' });
      return;
    }
    setMode({ ...mode, nameError: null, saveError: null, saving: true });
    const result = await updatePlayerCharacter(pc.id, {
      name: trimmedName,
      archetype: mode.archetype.trim() === '' ? null : mode.archetype,
      notes: mode.notes.trim() === '' ? null : mode.notes,
    });
    if (!result.ok) {
      setMode({
        ...mode,
        nameError: null,
        saveError: 'Could not save changes. Try again.',
        saving: false,
      });
      return;
    }
    setMode({ kind: 'viewing' });
    showToast('success', 'Agent updated.');
    onMutated();
  }

  const isEditing = mode.kind === 'editing';

  return (
    <div className="flex flex-col gap-6">
      {/* Header: portrait photo + identity */}
      <div className="flex gap-5 flex-wrap items-stretch">
        <PhotoPlaceholder />
        <div className="flex-1 min-w-[240px] flex flex-col gap-4">
          <FieldRow label="Name" required={isEditing} error={isEditing ? mode.nameError : null}>
            {isEditing ? (
              <input
                type="text"
                value={mode.name}
                onChange={(e) =>
                  setMode({ ...mode, name: e.target.value, nameError: null })
                }
                aria-invalid={mode.nameError ? true : undefined}
                autoFocus
                className={inputClass(Boolean(mode.nameError))}
              />
            ) : (
              <ReadOnlyValue value={currentName} />
            )}
          </FieldRow>

          <FieldRow label="Archetype">
            {isEditing ? (
              <input
                type="text"
                value={mode.archetype}
                onChange={(e) => setMode({ ...mode, archetype: e.target.value })}
                className={inputClass(false)}
                placeholder="e.g., Federal agent, journalist, medic"
              />
            ) : (
              <ReadOnlyValue
                value={currentArchetype || '—'}
                muted={!currentArchetype}
              />
            )}
          </FieldRow>

          <div>
            <FieldLabel>Status</FieldLabel>
            <StatusBadge status={pc.status} />
          </div>
        </div>
      </div>

      {/* Character sheet placeholder */}
      <section>
        <h3 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
          Character Sheet
        </h3>
        <div className="border border-dashed border-green-dim bg-desk-edge px-6 py-8 text-center flex flex-col items-center gap-2">
          <div className="font-display text-[14px] tracking-[0.18em] uppercase text-paper-worn">
            Full stats and bonds coming soon
          </div>
          <p className="font-ui text-[10px] tracking-[0.12em] uppercase text-green-mid max-w-md">
            HP · WP · SAN · BP, bonds, motivations, disorders, portrait
            upload — DEL-53
          </p>
        </div>
      </section>

      {/* Notes — the one real body field */}
      <section>
        <h3 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
          Field Notes
        </h3>
        {isEditing ? (
          <textarea
            value={mode.notes}
            onChange={(e) => setMode({ ...mode, notes: e.target.value })}
            rows={5}
            placeholder="Anything you want to remember about this agent."
            className={[
              'w-full font-body text-[13px] text-paper bg-desk-groove',
              'border border-green-dim px-3 py-[9px] tracking-[0.04em] resize-y',
              'placeholder:text-green-mid/60 placeholder:tracking-normal',
              'focus:outline-none focus:border-green-mid focus:bg-green-void',
              'transition-colors duration-150',
            ].join(' ')}
          />
        ) : (
          <ReadOnlyNotes value={currentNotes} />
        )}
      </section>

      {isEditing && mode.saveError ? (
        <div
          role="alert"
          className="border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Save failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {mode.saveError}
          </div>
        </div>
      ) : null}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-green-dim/40">
        <div>
          {!isEditing && pc.status === 'active' ? (
            <button
              type="button"
              onClick={() => setRetireOpen(true)}
              className={retireButtonClass}
            >
              Retire
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={mode.saving}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={mode.saving}
                className={primaryButtonClass}
              >
                {mode.saving ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
                    />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={beginEdit}
                className={primaryButtonClass}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onBack}
                className={secondaryButtonClass}
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>

      {retireOpen ? (
        <RetireConfirmModal
          pc={pc}
          onClose={() => setRetireOpen(false)}
          onConfirmed={() => {
            setRetireOpen(false);
            showToast('success', 'Agent retired.');
            onMutated();
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Photo placeholder (portrait-oriented)                                     */
/* -------------------------------------------------------------------------- */

function PhotoPlaceholder() {
  return (
    <div
      className={[
        'w-[110px] h-[150px] flex-shrink-0 border border-dashed border-green-dim',
        'bg-desk-edge flex items-center justify-center text-center',
      ].join(' ')}
      aria-hidden="true"
    >
      <div className="font-stamp text-[10px] tracking-[0.22em] uppercase text-green-mid leading-tight">
        No
        <br />
        Photo
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Status badge (display-only)                                               */
/* -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<PlayerCharacterStatus, string> = {
  active: 'Active',
  retired: 'Retired',
  deceased: 'Deceased',
};

function StatusBadge({ status }: { status: PlayerCharacterStatus }) {
  return (
    <span
      className={[
        'inline-block font-ui text-[10px] tracking-[0.18em] uppercase',
        'border border-green-dim/60 text-paper-worn px-2 py-[3px]',
      ].join(' ')}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Retire confirm modal                                                      */
/* -------------------------------------------------------------------------- */

function RetireConfirmModal({
  pc,
  onClose,
  onConfirmed,
}: {
  pc: PlayerCharacter;
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
      subtitle="Mark this agent as retired"
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-3">
        Retire <span className="text-paper">{pc.name}</span>?
      </p>
      <p className="font-ui text-[11px] tracking-[0.04em] text-paper-dark/80 leading-relaxed mb-5">
        This agent will be marked retired. They remain attached to their
        campaign (if any) but can no longer be played. This can be
        reversed by a Handler.
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
          className={retireConfirmClass}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-amber-dim dg-status-dot"
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

/* -------------------------------------------------------------------------- */
/*  Local display primitives                                                  */
/* -------------------------------------------------------------------------- */

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]">
      {children}
      {required ? <span className="text-amber-dim ml-1">*</span> : null}
    </div>
  );
}

function FieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      {children}
      {error ? (
        <p
          role="alert"
          className="font-ui text-[10px] tracking-[0.1em] text-red-stamp mt-[6px] uppercase"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReadOnlyValue({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <div
      className={[
        'font-body text-[14px] tracking-[0.04em] py-[2px]',
        muted ? 'text-green-mid' : 'text-paper',
      ].join(' ')}
    >
      {value}
    </div>
  );
}

function ReadOnlyNotes({ value }: { value: string }) {
  if (!value) {
    return (
      <div className="font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid italic">
        No notes recorded.
      </div>
    );
  }
  return (
    <div className="font-body text-[13px] tracking-[0.04em] text-paper-worn leading-relaxed whitespace-pre-wrap">
      {value}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return [
    'w-full font-body text-[13px] text-paper bg-desk-groove',
    'border border-green-dim px-3 py-[9px] tracking-[0.04em]',
    'placeholder:text-green-mid/60 placeholder:tracking-normal',
    'focus:outline-none focus:border-green-mid focus:bg-green-void',
    'transition-colors duration-150',
    hasError ? 'border-red-faded focus:border-red-stamp' : '',
  ].join(' ');
}

/* -------------------------------------------------------------------------- */
/*  Shared button classes                                                     */
/* -------------------------------------------------------------------------- */

const primaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'cursor-pointer transition-all duration-150',
  'flex items-center gap-2',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
].join(' ');

const secondaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-paper-worn border border-green-dim/60 bg-transparent',
  'cursor-pointer transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
  'focus:outline-none focus:border-green-bright',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

const retireButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-amber-dim border border-amber-dim/60 bg-amber-dim/[0.05]',
  'cursor-pointer transition-all duration-150',
  'hover:bg-amber-dim/[0.12] hover:border-amber-dim',
  'focus:outline-none focus:border-amber-dim',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

const cancelButtonClass = [
  'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
  'text-green-mid border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

const retireConfirmClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-amber-dim border border-amber-dim/60 bg-amber-dim/[0.08]',
  'cursor-pointer transition-all duration-150',
  'hover:bg-amber-dim/[0.16] hover:shadow-[0_0_12px_rgba(170,140,80,0.18)]',
  'focus:outline-none focus:border-amber-dim',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
  'flex items-center gap-2',
].join(' ');
