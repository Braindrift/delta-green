/**
 * Members management screen (DEL-44).
 *
 * Three sections, in order:
 *
 *   1. Active · N      — current campaign members. Each row has a `⋯`
 *                        menu with "Remove from campaign". The Handler's
 *                        own row never renders the menu (transfer of
 *                        Handler is a separate flow, M-7c).
 *   2. Pending · N     — outstanding invitations. Each row has "Revoke".
 *   3. Former · N      — agents who left or were removed, with the
 *                        date the row flipped to `former`.
 *
 * Top-right `+ Invite` opens `InviteModal` — handles both the By email
 * and Find user paths internally. Conflict states (already invited /
 * already a member) render inside the same dialog.
 *
 * Data:
 *   - `listCampaignMembers` returns active + former together; the page
 *     splits them locally so the two sections share a single fetch.
 *   - `listPendingInvitations` returns rows where `status = 'pending' AND
 *     expires_at > now()`.
 *   - Both refetch together via `reload()` after any mutation (invite,
 *     revoke, kick). The cost is one extra round-trip per action; the
 *     simplicity wins over hand-rolled optimistic state.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import {
  listCampaignMembers,
  listPendingInvitations,
  revokeInvitation,
} from '@/lib/members';
import type {
  CampaignMemberWithProfile,
  PendingInvitationWithProfile,
} from '@/types/members';
import { InviteModal } from '@/components/manage/InviteModal';
import { KickConfirmModal } from '@/components/manage/KickConfirmModal';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      members: CampaignMemberWithProfile[];
      pendingInvitations: PendingInvitationWithProfile[];
    };

type DialogState =
  | { kind: 'closed' }
  | { kind: 'invite' }
  | { kind: 'kick'; memberId: string; memberLabel: string };

export function ManageMembersPage() {
  const { campaign } = useCurrentCampaign();
  const { user } = useAuth();
  const { showToast } = useToast();

  const campaignId = campaign?.id ?? null;
  const callerUserId = user?.id ?? null;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });

  /**
   * Fetch members + pending invites in parallel. The two reads are
   * independent and the screen renders both at the same time, so
   * `Promise.all` is the right shape.
   */
  const reload = useCallback(async () => {
    if (!campaignId) return;
    setState({ kind: 'loading' });

    const [membersResult, invitesResult] = await Promise.all([
      listCampaignMembers(campaignId),
      listPendingInvitations(campaignId),
    ]);

    if (!membersResult.ok || !invitesResult.ok) {
      setState({ kind: 'error' });
      return;
    }

    setState({
      kind: 'ready',
      members: membersResult.data,
      pendingInvitations: invitesResult.data,
    });
  }, [campaignId]);

  useEffect(() => {
    // `reload` calls `setState({ kind: 'loading' })` synchronously before
    // awaiting the network. Deferring via a microtask keeps that setState
    // off the same tick as the effect body — matches the pattern in
    // `CampaignContext.tsx` and `ManageGuard.tsx`.
    void Promise.resolve().then(() => reload());
  }, [reload]);

  const active = useMemo(
    () =>
      state.kind === 'ready'
        ? state.members.filter((m) => m.status === 'active')
        : [],
    [state],
  );
  const former = useMemo(
    () =>
      state.kind === 'ready'
        ? state.members.filter((m) => m.status === 'former')
        : [],
    [state],
  );
  const pending = useMemo(
    () => (state.kind === 'ready' ? state.pendingInvitations : []),
    [state],
  );

  // Sets used by the invite modal for fast client-side conflict checks.
  const activeUserIds = useMemo(
    () => new Set(active.map((m) => m.user_id)),
    [active],
  );
  const pendingInviteUserIds = useMemo(
    () =>
      new Set(
        pending
          .map((i) => i.invitee_user_id)
          .filter((id): id is string => id !== null),
      ),
    [pending],
  );

  async function handleRevoke(invitationId: string) {
    const result = await revokeInvitation(invitationId);
    if (!result.ok) {
      showToast('error', 'Could not revoke the invitation. Try again.');
      return;
    }
    showToast('success', 'Invitation revoked.');
    void reload();
  }

  return (
    <section>
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
            Members
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            Handler controls — invites, agents, former members
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDialog({ kind: 'invite' })}
          disabled={state.kind !== 'ready'}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          + Invite
        </button>
      </header>

      {state.kind === 'loading' ? (
        <LoadingCard />
      ) : state.kind === 'error' ? (
        <ErrorCard onRetry={() => void reload()} />
      ) : (
        <div className="flex flex-col gap-8">
          <ActiveSection
            members={active}
            callerUserId={callerUserId}
            onKick={(m) =>
              setDialog({
                kind: 'kick',
                memberId: m.id,
                memberLabel: m.username ?? 'this agent',
              })
            }
          />
          <PendingSection invitations={pending} onRevoke={handleRevoke} />
          <FormerSection members={former} />
        </div>
      )}

      {dialog.kind === 'invite' && campaignId ? (
        <InviteModal
          campaignId={campaignId}
          existingMemberUserIds={activeUserIds}
          pendingInvitationUserIds={pendingInviteUserIds}
          onClose={() => setDialog({ kind: 'closed' })}
          onSent={() => {
            void reload();
          }}
        />
      ) : null}

      {dialog.kind === 'kick' ? (
        <KickConfirmModal
          memberId={dialog.memberId}
          memberLabel={dialog.memberLabel}
          onClose={() => setDialog({ kind: 'closed' })}
          onConfirmed={() => {
            setDialog({ kind: 'closed' });
            showToast('success', 'Agent removed from campaign.');
            void reload();
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Active section                                                            */
/* -------------------------------------------------------------------------- */

function ActiveSection({
  members,
  callerUserId,
  onKick,
}: {
  members: CampaignMemberWithProfile[];
  callerUserId: string | null;
  onKick: (member: CampaignMemberWithProfile) => void;
}) {
  return (
    <SectionShell title="Active" count={members.length}>
      {members.length === 0 ? (
        <SectionEmpty text="No active members yet." />
      ) : (
        <ul>
          {members.map((m) => (
            <ActiveRow
              key={m.id}
              member={m}
              isSelf={m.user_id === callerUserId}
              onKick={() => onKick(m)}
            />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function ActiveRow({
  member,
  isSelf,
  onKick,
}: {
  member: CampaignMemberWithProfile;
  isSelf: boolean;
  onKick: () => void;
}) {
  const handle = member.username ?? 'unknown agent';
  const roleLabel = member.role === 'gm' ? 'Handler' : 'Agent';

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {handle}
          {isSelf ? (
            <span className="font-ui text-[10px] tracking-[0.14em] text-green-mid ml-2 uppercase">
              · you
            </span>
          ) : null}
        </div>
      </div>
      <span className="font-ui text-[9px] tracking-[0.16em] uppercase text-green-mid border border-green-dim/60 px-[6px] py-[2px]">
        {roleLabel}
      </span>
      {isSelf ? (
        // Spacer so the row height matches kebab-bearing rows.
        <span className="w-[28px] flex-shrink-0" aria-hidden="true" />
      ) : (
        <RowMenu label={`Actions for ${handle}`}>
          {(close) => (
            <button
              type="button"
              onClick={() => {
                close();
                onKick();
              }}
              className="dg-dropdown-item w-full text-left font-ui text-[10px] tracking-[0.14em] uppercase text-paper-worn px-3 py-[9px] hover:bg-red-faded/[0.08] hover:text-red-stamp transition-colors"
            >
              Remove from campaign
            </button>
          )}
        </RowMenu>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pending section                                                           */
/* -------------------------------------------------------------------------- */

function PendingSection({
  invitations,
  onRevoke,
}: {
  invitations: PendingInvitationWithProfile[];
  onRevoke: (id: string) => void | Promise<void>;
}) {
  return (
    <SectionShell title="Pending invites" count={invitations.length}>
      {invitations.length === 0 ? (
        <SectionEmpty text="No invitations are pending." />
      ) : (
        <ul>
          {invitations.map((i) => (
            <PendingRow key={i.id} invitation={i} onRevoke={() => onRevoke(i.id)} />
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

function PendingRow({
  invitation,
  onRevoke,
}: {
  invitation: PendingInvitationWithProfile;
  onRevoke: () => void;
}) {
  const handle =
    invitation.username ??
    invitation.invitee_email ??
    'pending invitee';
  const subtype = invitation.invitee_email
    ? 'Email invite'
    : 'Existing user invite';

  return (
    <li className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {handle}
        </div>
        <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px]">
          {subtype}
          {' · '}
          Expires {formatShortDate(invitation.expires_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        className={[
          'font-ui text-[10px] tracking-[0.2em] uppercase px-3 py-[5px]',
          'text-paper-worn border border-green-dim/60 bg-transparent',
          'transition-colors duration-150',
          'hover:text-red-stamp hover:border-red-faded',
        ].join(' ')}
      >
        Revoke
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Former section                                                            */
/* -------------------------------------------------------------------------- */

function FormerSection({ members }: { members: CampaignMemberWithProfile[] }) {
  return (
    <SectionShell title="Former agents" count={members.length}>
      {members.length === 0 ? (
        <SectionEmpty text="No former agents." />
      ) : (
        <ul>
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-green-dim/40 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
                  {m.username ?? 'unknown agent'}
                </div>
                <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-green-mid mt-[2px]">
                  Left {m.left_at ? formatShortDate(m.left_at) : '—'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function SectionShell({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <div className="border border-green-dim bg-desk-edge">{children}</div>
    </section>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="px-4 py-5 font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid">
      {text}
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
        Decrypting member records
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
/*  Row menu (kebab)                                                          */
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
          className="absolute top-[calc(100%+4px)] right-0 min-w-[200px] z-[50] flex flex-col overflow-hidden border border-green-mid bg-desk-edge"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
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
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
