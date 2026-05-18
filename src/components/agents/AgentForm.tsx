/**
 * Inline create / edit form for player characters (DEL-51).
 *
 * Self-contained: the form owns its input state, validation, submit-in-flight
 * spinner, and submission error. The parent only supplies the mode and
 * receives the persisted PC via `onSubmitted`. This shape lets the form
 * live unchanged inside two surfaces:
 *
 *   1. The `/agents` page modals (create + edit), wrapped in `ModalShell`.
 *   2. The DEL-46 accept-invite PC-picker, dropped in inline alongside the
 *      "use an existing PC" list. The picker reuses `mode: 'create'` and
 *      navigates the user into the join flow with the freshly created PC.
 *
 * Fields:
 *   - `name` — required, trimmed
 *   - `archetype` — optional, trimmed; empty → null
 *   - `notes` — optional freeform text; persisted to `data.notes`
 *
 * Buttons render at the bottom of the form. The submit label / loading
 * copy are parameterised so the create-vs-edit context can use the right
 * verbs. A cancel button is shown only when `onCancel` is wired up — the
 * accept-invite picker omits it because the picker chrome owns its own
 * back affordance.
 */

import { useState, type FormEvent } from 'react';

import {
  createPlayerCharacter,
  updatePlayerCharacter,
} from '@/lib/player-characters';
import type { PlayerCharacter } from '@/types/player-characters';

type AgentFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; pc: PlayerCharacter };

export type AgentFormProps = {
  mode: AgentFormMode;
  /** Label for the primary action button. Defaults to "Create" / "Save". */
  submitLabel?: string;
  /** Label shown while the submit is in flight. Defaults to "Saving…". */
  submittingLabel?: string;
  /** Optional cancel handler — renders a "Cancel" button next to submit. */
  onCancel?: () => void;
  /** Called with the persisted PC after a successful create or update. */
  onSubmitted: (pc: PlayerCharacter) => void;
};

type FieldErrors = {
  name?: string;
};

export function AgentForm({
  mode,
  submitLabel,
  submittingLabel = 'Saving…',
  onCancel,
  onSubmitted,
}: AgentFormProps) {
  const isEdit = mode.kind === 'edit';
  const initialNotes = mode.kind === 'edit' ? mode.pc.data?.notes ?? '' : '';

  const [name, setName] = useState(mode.kind === 'edit' ? mode.pc.name : '');
  const [archetype, setArchetype] = useState(
    mode.kind === 'edit' ? mode.pc.archetype ?? '' : '',
  );
  const [notes, setNotes] = useState(initialNotes);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (trimmedName === '') {
      setFieldErrors({ name: 'Name is required' });
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    const result = isEdit
      ? await updatePlayerCharacter(mode.pc.id, {
          name: trimmedName,
          archetype: archetype.trim() === '' ? null : archetype,
          notes: notes.trim() === '' ? null : notes,
        })
      : await createPlayerCharacter({
          name: trimmedName,
          archetype: archetype.trim() === '' ? null : archetype,
          notes: notes.trim() === '' ? null : notes,
        });

    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(
        isEdit
          ? 'Could not save changes. Try again.'
          : 'Could not create the agent. Try again.',
      );
      return;
    }

    onSubmitted(result.data);
  }

  const primaryLabel = submitLabel ?? (isEdit ? 'Save changes' : 'Create agent');

  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitError ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Submission failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {submitError}
          </div>
        </div>
      ) : null}

      <Field label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) {
              setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }
          }}
          aria-invalid={fieldErrors.name ? true : undefined}
          autoFocus
          className={inputClass(Boolean(fieldErrors.name))}
        />
        {fieldErrors.name ? (
          <p role="alert" className={errorTextClass}>
            {fieldErrors.name}
          </p>
        ) : null}
      </Field>

      <Field label="Archetype" hint="Optional. E.g., Federal agent, journalist, medic.">
        <input
          type="text"
          value={archetype}
          onChange={(e) => setArchetype(e.target.value)}
          className={inputClass(false)}
        />
      </Field>

      <Field label="Notes" hint="Optional. Anything you want to remember about this agent.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={[
            'w-full font-body text-[13px] text-paper bg-desk-groove',
            'border border-green-dim px-3 py-[9px] tracking-[0.04em] resize-y',
            'placeholder:text-green-mid/60 placeholder:tracking-normal',
            'focus:outline-none focus:border-green-mid focus:bg-green-void',
            'transition-colors duration-150',
          ].join(' ')}
        />
      </Field>

      <div className="flex items-center justify-end gap-3 mt-1">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={[
              'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
              'text-green-mid border border-green-dim/60 bg-transparent',
              'transition-colors duration-150',
              'hover:text-paper hover:border-green-mid',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className={primaryButtonClass}
        >
          {submitting ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
              />
              {submittingLabel}
            </>
          ) : (
            primaryLabel
          )}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local form primitives                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]">
        {label}
        {required ? <span className="text-amber-dim ml-1">*</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="font-ui text-[10px] tracking-[0.1em] text-green-mid/80 mt-[6px]">
          {hint}
        </p>
      ) : null}
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

const errorTextClass =
  'font-ui text-[10px] tracking-[0.1em] text-red-stamp mt-[6px] uppercase';

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
