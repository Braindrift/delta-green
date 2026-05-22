/**
 * Invite Players modal — DEL-77.
 *
 * Two-tab dialog (BY USERNAME / BY EMAIL) for a Handler to invite new
 * players to a campaign, plus a contextual confirmation step. Opened from
 * `CampaignInfoPanel`'s "+ Invite More Players" CTA (GM-only). Replaces
 * the DEL-75 stub.
 *
 * Backend + data layer are unchanged — this is a frontend-only build on
 * top of:
 *   - `searchUsersByUsername`         — prefix autocomplete
 *   - `listCampaignMembers`           — derive STATUS = Accepted
 *   - `listPendingInvitations`        — derive STATUS = Pending
 *   - `inviteExistingUser`            — username-tab batch insert
 *   - `createStrangerInvitation`      — email-tab insert
 *   - `sendInvitationEmail`           — email-tab magic-link dispatch
 *
 * State machine: a single `view` discriminator flips between the two tab
 * bodies and the two confirmation views. The username tab carries its
 * own `Set<string>` of selected user_ids across the round-trip so partial
 * failures can stay selected for retry per the DoD; succeeded rows are
 * dropped from the set before returning to the picker.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ModalShell } from '@/components/common/ModalShell';
import {
  inviteExistingUser,
  listCampaignMembers,
  listPendingInvitations,
  searchUsersByUsername,
} from '@/lib/members';
import {
  createStrangerInvitation,
  sendInvitationEmail,
} from '@/lib/invitations';
import type { UserProfileSummary } from '@/types/members';

export type InviteModalProps = {
  campaignId: string;
  /** Caller's auth user id — excluded from the search list. */
  callerId: string | null;
  onClose: () => void;
};

type StatusMap = Record<string, 'accepted' | 'pending' | 'not_invited'>;

type View =
  | { kind: 'username' }
  | { kind: 'email' }
  | {
      kind: 'confirm-username';
      total: number;
      succeeded: number;
      failed: string[]; // ids that stay selected for retry
    }
  | { kind: 'confirm-email'; success: boolean };

const SEARCH_DEBOUNCE_MS = 200;

export function InviteModal({ campaignId, callerId, onClose }: InviteModalProps) {
  const [view, setView] = useState<View>({ kind: 'username' });
  const [submitting, setSubmitting] = useState(false);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Username tab
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<UserProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);

  // Email tab
  const [email, setEmail] = useState('');

  /* -------------------- status map (members + pending) -------------------- */

  const refreshStatusMap = useCallback(async () => {
    const [membersResult, invitesResult] = await Promise.all([
      listCampaignMembers(campaignId),
      listPendingInvitations(campaignId),
    ]);
    const next: StatusMap = {};
    if (membersResult.ok) {
      for (const m of membersResult.data) {
        if (m.status === 'active') next[m.user_id] = 'accepted';
      }
    }
    if (invitesResult.ok) {
      for (const i of invitesResult.data) {
        if (i.invitee_user_id && !(i.invitee_user_id in next)) {
          next[i.invitee_user_id] = 'pending';
        }
      }
    }
    setStatusMap(next);
  }, [campaignId]);

  // setState is deferred via a microtask to satisfy
  // `react-hooks/set-state-in-effect`; same pattern as
  // `CampaignContext.tsx` and `CampaignInfoPanel.tsx`.
  useEffect(() => {
    void Promise.resolve().then(() => refreshStatusMap());
  }, [refreshStatusMap]);

  /* -------------------- username search (debounced) ----------------------- */

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Guard against out-of-order responses if the user types fast.
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed === '') {
      // Microtask defer — see refreshStatusMap effect comment.
      void Promise.resolve().then(() => {
        setResults([]);
        setSearching(false);
      });
      return;
    }
    const seq = ++searchSeqRef.current;
    void Promise.resolve().then(() => {
      setSearching(true);
      return searchUsersByUsername(trimmed).then((res) => {
        if (seq !== searchSeqRef.current) return;
        setSearching(false);
        if (res.ok) setResults(res.data);
        else setResults([]);
      });
    });
  }, [debouncedQuery]);

  /* -------------------- username submit ----------------------------------- */

  const visibleResults = useMemo(
    () => results.filter((r) => r.user_id !== callerId),
    [results, callerId],
  );

  const selectableIds = useMemo(
    () =>
      new Set(
        visibleResults
          .filter((r) => (statusMap[r.user_id] ?? 'not_invited') === 'not_invited')
          .map((r) => r.user_id),
      ),
    [visibleResults, statusMap],
  );

  const selectedCount = useMemo(() => {
    let n = 0;
    for (const id of selected) if (selectableIds.has(id)) n++;
    return n;
  }, [selected, selectableIds]);

  async function handleUsernameInvite() {
    if (submitting || selectedCount === 0) return;
    const ids = [...selected].filter((id) => selectableIds.has(id));
    setSubmitting(true);

    const outcomes = await Promise.all(
      ids.map(async (id) => {
        const res = await inviteExistingUser({
          campaignId,
          inviteeUserId: id,
        });
        return { id, ok: res.ok };
      }),
    );

    const succeededIds = outcomes.filter((o) => o.ok).map((o) => o.id);
    const failedIds = outcomes.filter((o) => !o.ok).map((o) => o.id);

    // Optimistically reflect the new "pending" status so the picker shows
    // succeeded rows as Pending on the way back from "Invite more".
    setStatusMap((prev) => {
      const next = { ...prev };
      for (const id of succeededIds) next[id] = 'pending';
      return next;
    });
    // Drop succeeded ids from the selection so "Invite more" doesn't carry
    // them; failed ids stay selected for retry per the DoD.
    setSelected(new Set(failedIds));

    // Re-sync with the server in the background so we pick up any
    // server-side state we didn't predict.
    void refreshStatusMap();

    setSubmitting(false);
    setView({
      kind: 'confirm-username',
      total: ids.length,
      succeeded: succeededIds.length,
      failed: failedIds,
    });
  }

  /* -------------------- email submit -------------------------------------- */

  const emailValid = isLikelyEmail(email);

  async function handleEmailInvite() {
    if (submitting || !emailValid) return;
    setSubmitting(true);

    const created = await createStrangerInvitation({
      campaignId,
      inviteeEmail: email,
    });

    let success = false;
    if (created.ok) {
      const sent = await sendInvitationEmail(created.data.id);
      success = sent.ok;
    }

    setSubmitting(false);
    setView({ kind: 'confirm-email', success });
  }

  /* -------------------- confirm view actions ------------------------------ */

  function handleInviteMoreAgents() {
    if (view.kind === 'confirm-username') setView({ kind: 'username' });
    else if (view.kind === 'confirm-email') {
      setEmail('');
      setView({ kind: 'email' });
    }
  }

  function handleReturnToCampaign() {
    onClose();
  }

  /* -------------------- render -------------------------------------------- */

  const isConfirm = view.kind === 'confirm-username' || view.kind === 'confirm-email';
  const title = isConfirm ? 'Invitation Status' : 'Invite Players';

  return (
    <ModalShell
      title={title}
      onClose={onClose}
      preventClose={submitting}
      closeOnChrome={false}
      width={520}
    >
      {!isConfirm ? (
        <div className="flex flex-col gap-5">
          <TabSwitcher
            active={view.kind === 'email' ? 'email' : 'username'}
            onChange={(tab) =>
              setView({ kind: tab === 'email' ? 'email' : 'username' })
            }
          />

          {/* Fixed body height so the modal doesn't reflow between the
              username and email tabs — username = search + 240px list,
              email = a single field. */}
          <div className="min-h-[310px] flex flex-col">
            {view.kind === 'username' ? (
              <UsernameTab
                query={query}
                onQueryChange={setQuery}
                searching={searching}
                results={visibleResults}
                statusMap={statusMap}
                selected={selected}
                onToggle={(id) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            ) : (
              <EmailTab email={email} onEmailChange={setEmail} />
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={secondaryButtonClass}
            >
              Back
            </button>
            {view.kind === 'username' ? (
              <button
                type="button"
                onClick={handleUsernameInvite}
                disabled={submitting || selectedCount === 0}
                className={primaryButtonClass}
              >
                {submitting ? 'Sending…' : `Invite${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEmailInvite}
                disabled={submitting || !emailValid}
                className={primaryButtonClass}
              >
                {submitting ? 'Sending…' : 'Invite'}
              </button>
            )}
          </footer>
        </div>
      ) : (
        <ConfirmView
          view={view}
          onInviteMore={handleInviteMoreAgents}
          onReturn={handleReturnToCampaign}
        />
      )}
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Subviews                                                                  */
/* -------------------------------------------------------------------------- */

function TabSwitcher({
  active,
  onChange,
}: {
  active: 'username' | 'email';
  onChange: (tab: 'username' | 'email') => void;
}) {
  return (
    <div className="flex border border-green-dim">
      <TabButton
        active={active === 'username'}
        onClick={() => onChange('username')}
      >
        By Username
      </TabButton>
      <TabButton active={active === 'email'} onClick={() => onChange('email')}>
        By Email
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[10px]',
        'transition-all duration-150',
        active
          ? 'text-green-accent bg-green-accent/[0.08] border-b-2 border-green-bright'
          : 'text-green-mid bg-transparent border-b-2 border-transparent hover:text-paper-worn',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function UsernameTab({
  query,
  onQueryChange,
  searching,
  results,
  statusMap,
  selected,
  onToggle,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  searching: boolean;
  results: UserProfileSummary[];
  statusMap: StatusMap;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const trimmed = query.trim();
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-ui text-[10px] tracking-[0.18em] uppercase text-green-mid">
          Search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Type a username…"
          className={inputClass}
        />
      </label>

      <div className="border border-green-dim bg-desk-edge h-[240px] overflow-y-auto">
        {trimmed === '' ? (
          <EmptyListLine text="Type a username to search." />
        ) : searching && results.length === 0 ? (
          <EmptyListLine text="Searching…" />
        ) : results.length === 0 ? (
          <EmptyListLine text="No matching agents." />
        ) : (
          <ul>
            {results.map((r) => {
              const status = statusMap[r.user_id] ?? 'not_invited';
              const disabled = status !== 'not_invited';
              const checked = selected.has(r.user_id);
              return (
                <li
                  key={r.user_id}
                  className="flex items-center gap-3 px-4 py-[10px] border-b border-green-dim/40 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={checked && !disabled}
                    disabled={disabled}
                    onChange={() => onToggle(r.user_id)}
                    className="w-[14px] h-[14px] accent-green-accent disabled:opacity-40"
                  />
                  <div className="flex-1 min-w-0 font-ui text-[12px] tracking-[0.06em] text-paper truncate">
                    {r.username}
                  </div>
                  <StatusChip status={status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmailTab({
  email,
  onEmailChange,
}: {
  email: string;
  onEmailChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-ui text-[10px] tracking-[0.18em] uppercase text-green-mid">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="agent@example.com"
          autoComplete="off"
          className={inputClass}
        />
      </label>
      <p className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid">
        A magic-link invitation will be delivered to this address.
      </p>
    </div>
  );
}

function ConfirmView({
  view,
  onInviteMore,
  onReturn,
}: {
  view: Extract<View, { kind: 'confirm-username' } | { kind: 'confirm-email' }>;
  onInviteMore: () => void;
  onReturn: () => void;
}) {
  const { headline, tone } = confirmCopy(view);
  return (
    <div className="flex flex-col gap-6">
      <div className="border border-green-dim bg-desk-edge px-5 py-6 text-center">
        <div
          className={[
            'font-display text-[15px] tracking-[0.22em] uppercase',
            tone === 'ok' ? 'text-green-accent' : tone === 'partial' ? 'text-amber-dim' : 'text-red-stamp',
          ].join(' ')}
        >
          {headline}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-3">
        <button type="button" onClick={onReturn} className={secondaryButtonClass}>
          Return to Campaign
        </button>
        <button type="button" onClick={onInviteMore} className={primaryButtonClass}>
          Invite More Agents
        </button>
      </footer>
    </div>
  );
}

function StatusChip({ status }: { status: 'accepted' | 'pending' | 'not_invited' }) {
  const label =
    status === 'accepted' ? 'Accepted' : status === 'pending' ? 'Pending' : 'Not Invited';
  const tone =
    status === 'accepted'
      ? 'text-green-accent border-green-mid'
      : status === 'pending'
        ? 'text-amber-dim border-amber-dim/60'
        : 'text-green-mid border-green-dim/60';
  return (
    <span
      className={[
        'font-ui text-[9px] tracking-[0.18em] uppercase px-2 py-[3px] border flex-shrink-0',
        tone,
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function EmptyListLine({ text }: { text: string }) {
  return (
    <div className="px-4 py-5 font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
      {text}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function confirmCopy(
  view: Extract<View, { kind: 'confirm-username' } | { kind: 'confirm-email' }>,
): { headline: string; tone: 'ok' | 'partial' | 'fail' } {
  if (view.kind === 'confirm-email') {
    return view.success
      ? { headline: 'EMAIL INVITATION SUCCESSFULLY DELIVERED', tone: 'ok' }
      : { headline: 'EMAIL INVITATION FAILED TO DELIVER', tone: 'fail' };
  }
  const { total, succeeded } = view;
  if (succeeded === total) {
    return { headline: 'INVITATIONS SUCCESSFULLY DELIVERED', tone: 'ok' };
  }
  if (succeeded === 0) {
    return { headline: 'FAILED TO DELIVER INVITATIONS', tone: 'fail' };
  }
  return { headline: `${succeeded}/${total} INVITATIONS DELIVERED`, tone: 'partial' };
}

// Minimal client-side gate. The server is the source of truth — we only
// guard against the obvious empty / no-`@` typo here so the Invite button
// is disabled until the input looks plausible.
function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  const at = trimmed.indexOf('@');
  return at > 0 && at < trimmed.length - 1;
}

/* -------------------------------------------------------------------------- */
/*  Shared styles (duplicated from CampaignInfoPanel for a tight diff)        */
/* -------------------------------------------------------------------------- */

const primaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-accent/[0.06]',
  'disabled:hover:border-green-mid disabled:hover:shadow-none',
].join(' ');

const secondaryButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-paper-worn border border-green-dim/60 bg-transparent',
  'transition-all duration-150',
  'hover:text-paper hover:border-green-mid',
  'disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ');

const inputClass = [
  'font-ui text-[13px] text-paper bg-desk-edge border border-green-dim',
  'px-3 py-[8px] outline-none',
  'focus:border-green-mid focus:bg-desk-edge',
  'placeholder:text-green-mid/70',
].join(' ');
