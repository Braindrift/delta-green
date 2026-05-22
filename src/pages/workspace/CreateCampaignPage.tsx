/**
 * Workspace — Create campaign.
 *
 * Single-page form + success modal. Mounted at `/campaigns/new` under the
 * Workspace shell. The success state is an overlay over the same URL rather
 * than a separate route — once the campaign exists the URL is technically
 * stale (`/campaigns/new` shows a finished campaign), but the trade-off is
 * intentional: it keeps the modal action free to route the Handler back to
 * the workspace landing page.
 *
 * Data flow:
 *   1. User fills the form. `max_agents` is range-validated onBlur and on
 *      submit; `name` is checked for uniqueness on submit only (against the
 *      caller's owned campaigns).
 *   2. `createCampaign()` inserts the row. The Handler `campaign_members`
 *      row is created in-transaction by `campaign_owner_becomes_gm`.
 *   3. On success, we hold the inserted `Campaign` in local state and swap
 *      to the success view.
 *
 * The cancel button is a `<Link>` rather than a form button so the browser
 * back stack stays clean — pressing back from `/` lands wherever the user
 * came from instead of bouncing through `/campaigns/new`.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { checkCampaignNameAvailable, createCampaign } from '@/lib/campaigns';
import type { Campaign } from '@/types/campaigns';

const MAX_AGENTS_MIN = 1;
const MAX_AGENTS_MAX = 12;
const MAX_AGENTS_DEFAULT = 6;

type ViewState =
  | { kind: 'form' }
  | { kind: 'success'; campaign: Campaign };

type FieldErrors = {
  name?: string;
  maxAgents?: string;
};

export function CreateCampaignPage() {
  const navigate = useNavigate();

  const [view, setView] = useState<ViewState>({ kind: 'form' });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxAgents, setMaxAgents] = useState<string>(String(MAX_AGENTS_DEFAULT));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validateMaxAgents(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return 'Max agents is required';
    // Strict integer in range. `Number(trimmed)` would accept "6.5" silently.
    if (!/^\d+$/.test(trimmed)) return 'Max agents must be a whole number between 1 and 12';
    const n = Number(trimmed);
    if (n < MAX_AGENTS_MIN || n > MAX_AGENTS_MAX) {
      return 'Max agents must be between 1 and 12';
    }
    return undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const maxAgentsError = validateMaxAgents(maxAgents);

    const nextErrors: FieldErrors = {};
    if (trimmedName === '') {
      nextErrors.name = 'Name is required';
    }
    if (maxAgentsError) {
      nextErrors.maxAgents = maxAgentsError;
    }
    if (nextErrors.name || nextErrors.maxAgents) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);

    const availability = await checkCampaignNameAvailable(trimmedName);
    if (!availability.ok) {
      setSubmitting(false);
      setSubmitError('Could not verify the campaign name. Try again.');
      return;
    }
    if (!availability.data) {
      setSubmitting(false);
      setFieldErrors({ name: 'A campaign with this name already exists' });
      return;
    }

    const result = await createCampaign({
      name: trimmedName,
      description: trimmedDescription === '' ? null : trimmedDescription,
      max_agents: Number(maxAgents),
    });

    setSubmitting(false);

    if (!result.ok) {
      // `conflict` here is a defensive map for a race against another tab
      // creating the same name between the availability check and insert.
      // Everything else is bucketed as a generic submission error — the
      // detail is in the console for diagnosis, not in the UI.
      if (result.kind === 'conflict') {
        setFieldErrors({ name: 'A campaign with this name already exists' });
        return;
      }
      setSubmitError('Could not create the campaign. Try again.');
      return;
    }

    setView({ kind: 'success', campaign: result.data });
  }

  function handleMaxAgentsBlur() {
    const error = validateMaxAgents(maxAgents);
    setFieldErrors((prev) => ({ ...prev, maxAgents: error }));
  }

  function handleNameChange(value: string) {
    setName(value);
    if (fieldErrors.name) {
      setFieldErrors((prev) => ({ ...prev, name: undefined }));
    }
  }

  function handleMaxAgentsChange(value: string) {
    setMaxAgents(value);
    if (fieldErrors.maxAgents) {
      setFieldErrors((prev) => ({ ...prev, maxAgents: undefined }));
    }
  }

  if (view.kind === 'success') {
    return (
      <SuccessOverlay
        campaign={view.campaign}
        onOpenWorkspace={() => navigate('/')}
      />
    );
  }

  return (
    <div className="max-w-xl">
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          New campaign
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Start a fresh dossier — you will be filed as Handler
        </p>
      </header>

      {submitError ? (
        <div
          role="alert"
          className="mb-5 border border-red-faded bg-red-faded/[0.08] px-4 py-3"
        >
          <div className="font-stamp text-xs tracking-[0.18em] uppercase mb-1 text-red-stamp">
            Submission failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {submitError}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Name"
          required
          value={name}
          onChange={handleNameChange}
          error={fieldErrors.name}
          autoFocus
        />

        <FormTextArea
          label="Short description"
          value={description}
          onChange={setDescription}
          hint="Optional. Visible to all members."
        />

        <FormField
          label="Max agents"
          type="number"
          inputMode="numeric"
          min={MAX_AGENTS_MIN}
          max={MAX_AGENTS_MAX}
          value={maxAgents}
          onChange={handleMaxAgentsChange}
          onBlur={handleMaxAgentsBlur}
          error={fieldErrors.maxAgents}
          hint={`Between ${MAX_AGENTS_MIN} and ${MAX_AGENTS_MAX}. Default ${MAX_AGENTS_DEFAULT}.`}
        />

        <div className="flex items-center gap-3 mt-2">
          <button
            type="submit"
            disabled={submitting}
            className={[
              'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[11px]',
              'text-green-accent border border-green-mid bg-green-accent/[0.06]',
              'cursor-pointer transition-all duration-150',
              'flex items-center justify-center gap-[10px]',
              'hover:bg-green-accent/[0.12] hover:border-green-bright',
              'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
              'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
              'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            ].join(' ')}
          >
            {submitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
                />
                Filing dossier…
              </>
            ) : (
              'Create campaign'
            )}
          </button>

          <Link
            to="/"
            className={[
              'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[11px]',
              'text-green-mid border border-green-dim/60 bg-transparent',
              'transition-colors duration-150',
              'hover:text-paper hover:border-green-mid',
            ].join(' ')}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local form primitives                                                     */
/* -------------------------------------------------------------------------- */

type FormFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  required?: boolean;
  autoFocus?: boolean;
  type?: 'text' | 'number';
  inputMode?: 'numeric' | 'text';
  min?: number;
  max?: number;
};

function FormField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required,
  autoFocus,
  type = 'text',
  inputMode,
  min,
  max,
}: FormFieldProps) {
  const inputId = `cc-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = !error && hint ? `${inputId}-hint` : undefined;

  return (
    <div className="mb-5">
      <label
        htmlFor={inputId}
        className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]"
      >
        {label}
        {required ? <span className="text-amber-dim ml-1">*</span> : null}
      </label>
      <input
        id={inputId}
        type={type}
        inputMode={inputMode}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId ?? hintId}
        className={[
          'w-full font-body text-[13px] text-paper bg-desk-groove',
          'border border-green-dim px-3 py-[9px] tracking-[0.04em]',
          'placeholder:text-green-mid/60 placeholder:tracking-normal',
          'focus:outline-none focus:border-green-mid focus:bg-green-void',
          'transition-colors duration-150',
          error ? 'border-red-faded focus:border-red-stamp' : '',
        ].join(' ')}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="font-ui text-[10px] tracking-[0.1em] text-red-stamp mt-[6px] uppercase"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          className="font-ui text-[10px] tracking-[0.1em] text-green-mid/80 mt-[6px]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FormTextAreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
};

function FormTextArea({ label, value, onChange, hint }: FormTextAreaProps) {
  const inputId = `cc-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="mb-5">
      <label
        htmlFor={inputId}
        className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]"
      >
        {label}
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        aria-describedby={hintId}
        className={[
          'w-full font-body text-[13px] text-paper bg-desk-groove',
          'border border-green-dim px-3 py-[9px] tracking-[0.04em] resize-y',
          'placeholder:text-green-mid/60 placeholder:tracking-normal',
          'focus:outline-none focus:border-green-mid focus:bg-green-void',
          'transition-colors duration-150',
        ].join(' ')}
      />
      {hint ? (
        <p
          id={hintId}
          className="font-ui text-[10px] tracking-[0.1em] text-green-mid/80 mt-[6px]"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Success overlay                                                           */
/* -------------------------------------------------------------------------- */

type SuccessOverlayProps = {
  campaign: Campaign;
  onOpenWorkspace: () => void;
};

function SuccessOverlay({ campaign, onOpenWorkspace }: SuccessOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cc-success-title"
      className="max-w-xl"
    >
      <div className="border border-green-mid bg-desk-edge px-7 py-7">
        <div className="font-stamp text-amber text-sm tracking-[0.22em] uppercase mb-2">
          Dossier filed
        </div>
        <h2
          id="cc-success-title"
          className="font-display text-[22px] font-light tracking-[0.18em] uppercase text-paper mb-3"
        >
          {campaign.name}
        </h2>
        <p className="font-ui text-[11px] tracking-[0.08em] text-paper-worn leading-relaxed mb-6">
          Campaign created and you have been filed as Handler.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onOpenWorkspace}
            className={[
              'flex-1 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[11px]',
              'text-green-accent border border-green-mid bg-green-accent/[0.06]',
              'cursor-pointer transition-all duration-150',
              'hover:bg-green-accent/[0.12] hover:border-green-bright',
              'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
              'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
            ].join(' ')}
          >
            Open workspace
          </button>
        </div>
      </div>
    </div>
  );
}
