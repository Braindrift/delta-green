/**
 * Workspace Profile screen (DEL-55).
 *
 * Lives at `/profile`, reached from the header `UserMenu` ("Profile" link).
 * Single piece of identity-state in v1: the user's `user_profiles.username`,
 * inline-editable. Email / password / security stay on the separate
 * `/account` screen (out of scope per the ticket).
 *
 * Username storage is `citext` and uniqueness is server-enforced (DEL-37).
 * Client-side validation here is purely a fast-fail UX — the load-bearing
 * safety net is the unique constraint, which surfaces as PostgREST
 * `23505` → `result.kind === 'conflict'`.
 */

import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { getMyUserProfile, updateMyUsername } from '@/lib/profile';

/** Same character set the auto-generator uses (DEL-37). Case-insensitive
 *  because `citext` will round-trip whatever case the user types. */
const USERNAME_REGEX = /^[a-z0-9_-]+$/i;
const USERNAME_MAX_LENGTH = 32;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; username: string };

type EditState =
  | { kind: 'viewing' }
  | { kind: 'editing'; draft: string; error: string | null }
  | { kind: 'saving'; draft: string };

export function WorkspaceProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const userId = user?.id ?? null;

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [editState, setEditState] = useState<EditState>({ kind: 'viewing' });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Defer setState off the effect body — same microtask trick the
    // Manage screens use (see ManageSettingsPage) to keep the cascading-
    // render lint rule happy when userId changes.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoadState({ kind: 'loading' });
      const result = await getMyUserProfile(userId);
      if (cancelled) return;
      if (!result.ok) {
        setLoadState({ kind: 'error' });
        return;
      }
      setLoadState({ kind: 'ready', username: result.data.username });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function beginEdit() {
    if (loadState.kind !== 'ready') return;
    setEditState({
      kind: 'editing',
      draft: loadState.username,
      error: null,
    });
  }

  function cancelEdit() {
    setEditState({ kind: 'viewing' });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || editState.kind !== 'editing') return;

    const trimmed = editState.draft.trim();

    const validationError = validateUsername(trimmed);
    if (validationError) {
      setEditState({ kind: 'editing', draft: editState.draft, error: validationError });
      return;
    }

    if (loadState.kind === 'ready' && trimmed.toLowerCase() === loadState.username.toLowerCase()) {
      setEditState({ kind: 'viewing' });
      return;
    }

    setEditState({ kind: 'saving', draft: editState.draft });
    const result = await updateMyUsername(userId, trimmed);

    if (!result.ok) {
      if (result.kind === 'conflict') {
        setEditState({
          kind: 'editing',
          draft: editState.draft,
          error: 'Username already taken.',
        });
        return;
      }
      showToast('error', 'Could not update username. Try again.');
      setEditState({ kind: 'editing', draft: editState.draft, error: null });
      return;
    }

    setLoadState({ kind: 'ready', username: result.data.username });
    setEditState({ kind: 'viewing' });
    showToast('success', 'Username updated.');
  }

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Profile
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Your public handler identity
        </p>
      </header>

      <div className="flex flex-col gap-8 max-w-2xl">
        <section>
          <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
            Identity
          </h2>
          <div className="border border-green-dim bg-desk-edge px-5 py-4">
            <div className="font-ui text-[10px] tracking-[0.12em] uppercase text-green-mid mb-2">
              Username
            </div>

            {loadState.kind === 'loading' ? (
              <div className="font-ui text-[11px] tracking-[0.06em] text-paper-worn">
                Loading…
              </div>
            ) : loadState.kind === 'error' ? (
              <div className="font-ui text-[10px] tracking-[0.12em] uppercase text-red-stamp">
                Could not load profile.
              </div>
            ) : editState.kind === 'viewing' ? (
              <ViewingRow username={loadState.username} onEdit={beginEdit} />
            ) : (
              <EditingForm
                state={editState}
                onChange={(draft) =>
                  setEditState((prev) =>
                    prev.kind === 'editing'
                      ? { kind: 'editing', draft, error: null }
                      : prev,
                  )
                }
                onCancel={cancelEdit}
                onSubmit={handleSubmit}
              />
            )}

            <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed mt-3 max-w-xl">
              Lower-case letters, digits, hyphens, and underscores. Up to 32
              characters. Visible to other agents on campaigns you share.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Subviews                                                                  */
/* -------------------------------------------------------------------------- */

function ViewingRow({ username, onEdit }: { username: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="font-ui text-[14px] tracking-[0.06em] text-green-accent">
        {username}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={[
          'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[7px]',
          'text-paper-worn border border-green-dim/60 bg-transparent',
          'cursor-pointer transition-colors duration-150',
          'hover:text-paper hover:border-green-mid',
          'focus:outline-none focus:border-green-bright',
        ].join(' ')}
      >
        Edit
      </button>
    </div>
  );
}

function EditingForm({
  state,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: Extract<EditState, { kind: 'editing' } | { kind: 'saving' }>;
  onChange: (draft: string) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const saving = state.kind === 'saving';
  const error = state.kind === 'editing' ? state.error : null;

  return (
    <form onSubmit={onSubmit}>
      <div className="flex items-start gap-3 flex-wrap">
        <input
          type="text"
          autoFocus
          value={state.draft}
          maxLength={USERNAME_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          aria-label="Username"
          aria-invalid={error !== null}
          className={[
            'font-ui text-[13px] tracking-[0.04em] text-paper',
            'bg-paper-dark/40 border px-3 py-[7px] flex-1 min-w-[200px]',
            'focus:outline-none transition-colors',
            error
              ? 'border-red-faded focus:border-red-stamp'
              : 'border-green-dim/60 focus:border-green-mid',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={saving}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[7px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'cursor-pointer transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
            'focus:outline-none focus:border-green-bright',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            'flex-shrink-0',
          ].join(' ')}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[7px]',
            'text-paper-worn border border-green-dim/60 bg-transparent',
            'cursor-pointer transition-colors duration-150',
            'hover:text-paper hover:border-green-mid',
            'focus:outline-none focus:border-green-bright',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'flex-shrink-0',
          ].join(' ')}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p
          className="font-ui text-[10px] tracking-[0.12em] uppercase text-red-stamp mt-2"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

function validateUsername(value: string): string | null {
  if (value === '') return 'Username can’t be empty.';
  if (value.length > USERNAME_MAX_LENGTH) {
    return `Username can’t exceed ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_REGEX.test(value)) {
    return 'Only letters, digits, hyphens, and underscores.';
  }
  return null;
}
