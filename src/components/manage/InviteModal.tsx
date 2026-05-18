/**
 * Invite modal — two tabs (By email / Find user) for existing-user invites.
 *
 * Internal state machine:
 *
 *   form  ── successful insert ──▶  sent
 *   form  ── conflict on insert ──▶ conflict
 *   form  ── "user not found"  ──▶ form (inline error, M-4↔M-5 boundary)
 *
 * The form view itself has two tabs but a single submit path: both end up
 * calling `inviteExistingUser({ campaignId, inviteeUserId })`. The
 * "By email" tab resolves email → user id via `findUserByEmail` first.
 *
 * Conflict detection happens twice — defensively client-side (against
 * the existing-member and pending-invite sets the parent passes in)
 * and at the DB via the partial unique on `campaign_invitations`. The
 * client check produces a friendlier UX without a round-trip; the DB
 * check is the source of truth and catches races.
 *
 * Self-invite is blocked client-side by comparing against the active
 * user's id. There's no DB-level guard — the Handler is already an
 * active member of their own campaign so the "already a member"
 * conflict would technically fire, but catching it early gives a
 * clearer "you can't invite yourself" inline error.
 */

import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import {
  findUserByEmail,
  inviteExistingUser,
  searchUsersByUsername,
} from '@/lib/members';
import type { UserProfileSummary } from '@/types/members';
import { ModalShell } from './ModalShell';

export type InviteModalProps = {
  campaignId: string;
  /**
   * Set of `user_id`s that are currently active members of the campaign.
   * Used to short-circuit "Already a member" without a DB round-trip.
   */
  existingMemberUserIds: Set<string>;
  /**
   * Set of `user_id`s with a pending (and still-valid) invitation. Used
   * to short-circuit "Already invited".
   */
  pendingInvitationUserIds: Set<string>;
  onClose: () => void;
  /** Called after an invitation row is persisted. The parent refreshes
   *  its lists and shows the "Invite sent" success state. */
  onSent: () => void;
};

type TabId = 'by-email' | 'find-user';

type ConflictKind = 'already_member' | 'already_invited';

type ViewState =
  | { kind: 'form' }
  | { kind: 'sent'; handle: string }
  | { kind: 'conflict'; conflict: ConflictKind; handle: string };

export function InviteModal({
  campaignId,
  existingMemberUserIds,
  pendingInvitationUserIds,
  onClose,
  onSent,
}: InviteModalProps) {
  const { user } = useAuth();
  const callerUserId = user?.id ?? null;

  const [tab, setTab] = useState<TabId>('by-email');
  const [view, setView] = useState<ViewState>({ kind: 'form' });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Send the invite, handling client-side conflict + self-invite checks
   * before hitting the DB. `handle` is the display label for the target
   * — username or email — used in the success / conflict copy.
   */
  async function sendInvite(targetUserId: string, handle: string) {
    if (submitting) return;
    setSubmitError(null);

    // Client-side conflict pre-check. The DB partial unique is the
    // ultimate guard, but catching it here avoids the round-trip and
    // gives the user a faster signal.
    if (callerUserId && targetUserId === callerUserId) {
      setSubmitError('You can not invite yourself.');
      return;
    }
    if (existingMemberUserIds.has(targetUserId)) {
      setView({ kind: 'conflict', conflict: 'already_member', handle });
      return;
    }
    if (pendingInvitationUserIds.has(targetUserId)) {
      setView({ kind: 'conflict', conflict: 'already_invited', handle });
      return;
    }

    setSubmitting(true);
    const trimmedMessage = message.trim();
    const result = await inviteExistingUser({
      campaignId,
      inviteeUserId: targetUserId,
      message: trimmedMessage === '' ? null : trimmedMessage,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.kind === 'conflict') {
        // Race: another tab issued an invite between our client check
        // and this insert. Treat as "Already invited".
        setView({ kind: 'conflict', conflict: 'already_invited', handle });
        return;
      }
      setSubmitError('Could not send the invitation. Try again.');
      return;
    }

    setView({ kind: 'sent', handle });
    onSent();
  }

  if (view.kind === 'sent') {
    return (
      <ModalShell
        title="Invitation sent"
        subtitle="Awaiting response"
        onClose={onClose}
        width={460}
      >
        <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
          Invitation sent to <span className="text-paper">{view.handle}</span>.
          They will see it in their inbox the next time they sign in.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={[
              'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
              'text-green-accent border border-green-mid bg-green-accent/[0.06]',
              'transition-all duration-150',
              'hover:bg-green-accent/[0.12] hover:border-green-bright',
              'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
            ].join(' ')}
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  if (view.kind === 'conflict') {
    const heading =
      view.conflict === 'already_member' ? 'Already a member' : 'Already invited';
    const body =
      view.conflict === 'already_member'
        ? `${view.handle} is already an active agent in this campaign.`
        : `${view.handle} already has a pending invitation. Wait for them to respond or revoke it from the list.`;

    return (
      <ModalShell title={heading} onClose={onClose} width={460}>
        <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
          {body}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setView({ kind: 'form' })}
            className={[
              'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
              'text-green-mid border border-green-dim/60 bg-transparent',
              'transition-colors duration-150',
              'hover:text-paper hover:border-green-mid',
            ].join(' ')}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onClose}
            className={[
              'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
              'text-green-accent border border-green-mid bg-green-accent/[0.06]',
              'transition-all duration-150',
              'hover:bg-green-accent/[0.12] hover:border-green-bright',
            ].join(' ')}
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  // form view
  return (
    <ModalShell
      title="Invite agent"
      subtitle="By email or by username"
      onClose={onClose}
      preventClose={submitting}
      width={560}
    >
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Invite by"
        className="flex items-center border-b border-green-dim mb-5"
      >
        <TabButton
          id="by-email"
          active={tab === 'by-email'}
          onSelect={() => setTab('by-email')}
        >
          By email
        </TabButton>
        <TabButton
          id="find-user"
          active={tab === 'find-user'}
          onSelect={() => setTab('find-user')}
        >
          Find user
        </TabButton>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Could not send
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {submitError}
          </div>
        </div>
      ) : null}

      {tab === 'by-email' ? (
        <ByEmailTab
          onResolved={sendInvite}
          submitting={submitting}
          message={message}
          onMessageChange={setMessage}
        />
      ) : (
        <FindUserTab
          onPick={sendInvite}
          submitting={submitting}
          message={message}
          onMessageChange={setMessage}
        />
      )}
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab button                                                                */
/* -------------------------------------------------------------------------- */

function TabButton({
  id,
  active,
  onSelect,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`invite-panel-${id}`}
      onClick={onSelect}
      className={[
        'font-ui text-[11px] tracking-[0.18em] uppercase px-4 py-[9px]',
        'transition-colors duration-150 border-b-2 -mb-px',
        active
          ? 'text-green-accent border-green-accent'
          : 'text-green-mid border-transparent hover:text-paper',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  By-email tab                                                              */
/* -------------------------------------------------------------------------- */

type ByEmailTabProps = {
  onResolved: (userId: string, handle: string) => void;
  submitting: boolean;
  message: string;
  onMessageChange: (v: string) => void;
};

function ByEmailTab({ onResolved, submitting, message, onMessageChange }: ByEmailTabProps) {
  const [email, setEmail] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function handleSubmit() {
    if (resolving || submitting) return;
    setInlineError(null);

    const trimmed = email.trim();
    if (trimmed === '') {
      setInlineError('Enter an email address.');
      return;
    }

    setResolving(true);
    const result = await findUserByEmail(trimmed);
    setResolving(false);

    if (!result.ok) {
      setInlineError('Could not look up that email. Try again.');
      return;
    }
    if (result.data === null) {
      // M-4 / M-5 boundary. Once stranger-invite lands the inline error
      // becomes a "create a magic-link invite →" CTA.
      setInlineError(
        'User with this email not found. Stranger-invite-by-email is coming soon.',
      );
      return;
    }

    onResolved(result.data, trimmed);
  }

  const busy = resolving || submitting;

  return (
    <div id="invite-panel-by-email" role="tabpanel">
      <FieldLabel>Email</FieldLabel>
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (inlineError) setInlineError(null);
        }}
        placeholder="agent@example.com"
        className={inputClass(Boolean(inlineError))}
        autoFocus
      />
      {inlineError ? (
        <p role="alert" className={errorClass}>
          {inlineError}
        </p>
      ) : null}

      <MessageField value={message} onChange={onMessageChange} />

      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className={primaryButtonClass}
        >
          {busy ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
              />
              Sending…
            </>
          ) : (
            'Send invitation'
          )}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Find-user tab                                                             */
/* -------------------------------------------------------------------------- */

const SEARCH_DEBOUNCE_MS = 250;

type FindUserTabProps = {
  onPick: (userId: string, handle: string) => void;
  submitting: boolean;
  message: string;
  onMessageChange: (v: string) => void;
};

function FindUserTab({ onPick, submitting, message, onMessageChange }: FindUserTabProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced search. Track the latest query in a ref so a stale resolve
  // doesn't overwrite a fresher result set.
  const latestQueryRef = useRef('');

  useEffect(() => {
    latestQueryRef.current = query;
    if (query.trim() === '') {
      // Defer the clear-on-empty setStates through a microtask so the
      // synchronous setState-in-effect lint rule stays happy — matches
      // the pattern used elsewhere in the codebase.
      void Promise.resolve().then(() => {
        setResults([]);
        setSearching(false);
        setSearchError(null);
      });
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      const result = await searchUsersByUsername(query);
      if (latestQueryRef.current !== query) return;
      setSearching(false);

      if (!result.ok) {
        setSearchError('Search failed. Try again.');
        setResults([]);
        return;
      }
      setResults(result.data);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div id="invite-panel-find-user" role="tabpanel">
      <FieldLabel>Username</FieldLabel>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing…"
        className={inputClass(false)}
        autoFocus
      />
      {searchError ? (
        <p role="alert" className={errorClass}>
          {searchError}
        </p>
      ) : null}

      <div className="mt-3 mb-1 min-h-[120px] max-h-[220px] overflow-y-auto border border-green-dim/40 bg-desk-groove">
        {query.trim() === '' ? (
          <EmptyHint text="Type at least one character to search." />
        ) : searching ? (
          <EmptyHint text="Searching…" />
        ) : results.length === 0 ? (
          <EmptyHint text="No users match that prefix." />
        ) : (
          <ul>
            {results.map((r) => (
              <li
                key={r.user_id}
                className="flex items-center justify-between px-3 py-[10px] border-b border-green-dim/40 last:border-b-0"
              >
                <span className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
                  {r.username}
                </span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onPick(r.user_id, r.username)}
                  className={[
                    'font-ui text-[10px] tracking-[0.2em] uppercase px-3 py-[5px]',
                    'text-green-accent border border-green-mid bg-green-accent/[0.06]',
                    'transition-colors duration-150',
                    'hover:bg-green-accent/[0.12] hover:border-green-bright',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  ].join(' ')}
                >
                  Invite
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MessageField value={message} onChange={onMessageChange} />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[100px] font-ui text-[11px] tracking-[0.1em] uppercase text-green-mid">
      {text}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared form bits                                                          */
/* -------------------------------------------------------------------------- */

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]">
      {children}
    </label>
  );
}

function MessageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-4 mb-4">
      <FieldLabel>Message (optional)</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="A short note for the invitee."
        className={[
          'w-full font-body text-[13px] text-paper bg-desk-groove',
          'border border-green-dim px-3 py-[8px] tracking-[0.04em] resize-y',
          'placeholder:text-green-mid/60 placeholder:tracking-normal',
          'focus:outline-none focus:border-green-mid focus:bg-green-void',
          'transition-colors duration-150',
        ].join(' ')}
      />
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

const errorClass =
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
