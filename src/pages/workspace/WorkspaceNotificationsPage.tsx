/**
 * Workspace — Notifications inbox (DEL-50).
 *
 * Two sections, both fed by the shared `NotificationsContext`:
 *   - "Unread · N"   — rows with `read_at is null`, foreground styling
 *   - "Earlier · read" — rows with `read_at not null`, dimmed
 *
 * Per-kind row rendering switches on `notification.kind`:
 *   - `invite_received`            — Open (modal in place — DEL-81), Dismiss
 *   - `invite_accepted`            — Open campaign, Dismiss
 *   - `invite_declined`            — Dismiss
 *   - `campaign_deleted`           — Dismiss only (no source to navigate to)
 *   - `handler_transfer_requested` — Open (→ /transfers/:id), Dismiss
 *   - `handler_transfer_declined`  — Dismiss only
 *   - `handler_transferred`        — Open campaign, Dismiss
 *
 * Row interaction: clicking the **Open** button marks the row read and
 * navigates. The row body itself doesn't navigate — too easy to nav by
 * accident while skimming the inbox. "Mark all read" stamps every unread
 * row in one update.
 *
 * Realtime: list + unread count come from `NotificationsContext`, which
 * subscribes to a per-user `postgres_changes` channel. Inserts (new invite
 * arrives while inbox is open) show up at the top without a reload.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AcceptInviteModal } from '@/components/invite/AcceptInviteModal';
import { useNotifications } from '@/contexts/NotificationsContext';
import type {
  CampaignDeletedPayload,
  HandlerTransferDeclinedPayload,
  HandlerTransferRequestedPayload,
  HandlerTransferredPayload,
  InviteAcceptedPayload,
  InviteDeclinedPayload,
  InviteReceivedPayload,
  Notification,
  PcDetachedPayload,
} from '@/types/notifications';

export function WorkspaceNotificationsPage() {
  const { state, markAllRead, markRead, dismiss, reload } = useNotifications();
  const [openInvitationId, setOpenInvitationId] = useState<string | null>(null);

  const { unread, earlier } = useMemo(() => {
    if (state.kind !== 'ready') return { unread: [], earlier: [] };
    const unread: Notification[] = [];
    const earlier: Notification[] = [];
    for (const n of state.notifications) {
      if (n.read_at) earlier.push(n);
      else unread.push(n);
    }
    return { unread, earlier };
  }, [state]);

  const isReady = state.kind === 'ready';
  const isEmpty = isReady && unread.length === 0 && earlier.length === 0;
  const hasUnread = unread.length > 0;

  return (
    <section>
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
            Notifications
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            Invites and campaign signals
          </p>
        </div>

        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={!hasUnread}
          className={markAllReadClass}
        >
          Mark all read
        </button>
      </header>

      {state.kind === 'loading' ? <LoadingCard /> : null}
      {state.kind === 'error' ? <ErrorCard /> : null}
      {isEmpty ? <EmptyCard /> : null}

      {isReady && !isEmpty ? (
        <div className="flex flex-col gap-8">
          {unread.length > 0 ? (
            <NotifSection
              title="Unread"
              count={unread.length}
              notifications={unread}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onOpenInvite={setOpenInvitationId}
              dimmed={false}
            />
          ) : null}
          {earlier.length > 0 ? (
            <NotifSection
              title="Earlier · read"
              count={earlier.length}
              notifications={earlier}
              onMarkRead={markRead}
              onDismiss={dismiss}
              onOpenInvite={setOpenInvitationId}
              dimmed
            />
          ) : null}
        </div>
      ) : null}

      {openInvitationId ? (
        <AcceptInviteModal
          invitationId={openInvitationId}
          onClose={() => setOpenInvitationId(null)}
          onResolved={() => {
            void reload();
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section                                                                   */
/* -------------------------------------------------------------------------- */

type NotifSectionProps = {
  title: string;
  count: number;
  notifications: Notification[];
  onMarkRead: (id: string) => Promise<void> | void;
  onDismiss: (id: string) => Promise<void> | void;
  onOpenInvite: (invitationId: string) => void;
  dimmed: boolean;
};

function NotifSection({
  title,
  count,
  notifications,
  onMarkRead,
  onDismiss,
  onOpenInvite,
  dimmed,
}: NotifSectionProps) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <ul className="border border-green-dim bg-desk-edge">
        {notifications.map((n) => (
          <NotifRow
            key={n.id}
            notification={n}
            onMarkRead={onMarkRead}
            onDismiss={onDismiss}
            onOpenInvite={onOpenInvite}
            dimmed={dimmed}
          />
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row — per-kind rendering                                                  */
/* -------------------------------------------------------------------------- */

type NotifRowProps = {
  notification: Notification;
  onMarkRead: (id: string) => Promise<void> | void;
  onDismiss: (id: string) => Promise<void> | void;
  onOpenInvite: (invitationId: string) => void;
  dimmed: boolean;
};

function NotifRow({
  notification,
  onMarkRead,
  onDismiss,
  onOpenInvite,
  dimmed,
}: NotifRowProps) {
  const navigate = useNavigate();

  const view = renderForKind(notification);

  function handleOpen() {
    if (!notification.read_at) void onMarkRead(notification.id);
    if (view.openInvitationId) {
      onOpenInvite(view.openInvitationId);
      return;
    }
    if (view.openTo) navigate(view.openTo);
  }

  function handleDismiss() {
    void onDismiss(notification.id);
  }

  return (
    <li
      className={[
        'flex items-start gap-4 px-4 py-3 border-b border-green-dim/40 last:border-b-0',
        dimmed ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex-shrink-0 mt-[2px]">
        <KindIcon glyph={view.icon} dimmed={dimmed} unread={!notification.read_at} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-ui text-[12px] tracking-[0.06em] text-paper truncate">
          {view.title}
        </div>
        {view.body ? (
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn mt-[2px] leading-relaxed">
            {view.body}
          </div>
        ) : null}
        <div className="font-ui text-[9px] tracking-[0.14em] uppercase text-green-mid mt-1">
          {formatTimestamp(notification.created_at)}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {view.openTo || view.openInvitationId ? (
          <button type="button" onClick={handleOpen} className={openButtonClass}>
            {view.openLabel ?? 'Open'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          className={dismissButtonClass}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

type RowView = {
  icon: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** Route to navigate to on Open. Mutually exclusive with `openInvitationId`. */
  openTo?: string;
  /** Invitation id — opens the accept-invite modal in place (DEL-81). */
  openInvitationId?: string;
  openLabel?: string;
};

function renderForKind(n: Notification): RowView {
  switch (n.kind) {
    case 'invite_received':
      return renderInviteReceived(n.payload);
    case 'invite_accepted':
      return renderInviteAccepted(n.payload);
    case 'invite_declined':
      return renderInviteDeclined(n.payload);
    case 'campaign_deleted':
      return renderCampaignDeleted(n.payload);
    case 'handler_transfer_requested':
      return renderTransferRequested(n.payload);
    case 'handler_transfer_declined':
      return renderTransferDeclined(n.payload);
    case 'handler_transferred':
      return renderTransferred(n.payload);
    case 'pc_detached':
      return renderPcDetached(n.payload);
  }
}

function renderInviteReceived(p: InviteReceivedPayload): RowView {
  const inviter = p.inviter_username ?? 'A Handler';
  const campaign = p.campaign_name ?? 'a campaign';
  return {
    icon: '✉',
    title: (
      <>
        <strong className="text-paper">{inviter}</strong> invited you to{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
    body: 'Open to accept or decline.',
    openInvitationId: p.invitation_id,
    openLabel: 'Open',
  };
}

function renderInviteAccepted(p: InviteAcceptedPayload): RowView {
  const invitee = p.invitee_username ?? 'An agent';
  const campaign = p.campaign_name ?? 'your campaign';
  return {
    icon: '✓',
    title: (
      <>
        <strong className="text-paper">{invitee}</strong> accepted your invite to{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
    openTo: `/campaigns/${p.campaign_id}/operations`,
    openLabel: 'Open campaign',
  };
}

function renderInviteDeclined(p: InviteDeclinedPayload): RowView {
  const invitee = p.invitee_username ?? 'An agent';
  const campaign = p.campaign_name ?? 'your campaign';
  return {
    icon: '✗',
    title: (
      <>
        <strong className="text-paper">{invitee}</strong> declined your invite to{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
  };
}

function renderCampaignDeleted(p: CampaignDeletedPayload): RowView {
  const deleter = p.deleted_by_username ?? 'The Handler';
  const campaign = p.campaign_name ?? 'a campaign';
  return {
    icon: '⌧',
    title: (
      <>
        <strong className="text-paper">{deleter}</strong> deleted{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
    body: 'The campaign and its records have been archived.',
  };
}

function renderTransferRequested(p: HandlerTransferRequestedPayload): RowView {
  const sender = p.from_username ?? 'The Handler';
  const campaign = p.campaign_name ?? 'a campaign';
  return {
    icon: '⇄',
    title: (
      <>
        <strong className="text-paper">{sender}</strong> wants to hand{' '}
        <strong className="text-paper">{campaign}</strong> to you
      </>
    ),
    body: 'Open to accept or decline the transfer.',
    openTo: `/transfers/${p.transfer_id}`,
    openLabel: 'Open',
  };
}

function renderTransferDeclined(p: HandlerTransferDeclinedPayload): RowView {
  const recipient = p.recipient_username ?? 'The recipient';
  const campaign = p.campaign_name ?? 'your campaign';
  return {
    icon: '✗',
    title: (
      <>
        <strong className="text-paper">{recipient}</strong> declined the transfer of{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
    body: 'You remain Handler of this campaign.',
  };
}

function renderPcDetached(p: PcDetachedPayload): RowView {
  const formerOwner = p.former_owner_username ?? 'A player';
  const campaign = p.campaign_name ?? 'this campaign';
  return {
    icon: '⌧',
    title: (
      <>
        <strong className="text-paper">{formerOwner}</strong> deleted their
        agent <strong className="text-paper">{p.pc_name}</strong>
      </>
    ),
    body: (
      <>
        They now exist as an NPC in{' '}
        <strong className="text-paper">{campaign}</strong>.
      </>
    ),
  };
}

function renderTransferred(p: HandlerTransferredPayload): RowView {
  const newHandler = p.new_handler_username ?? 'A player';
  const campaign = p.campaign_name ?? 'your campaign';
  return {
    icon: '⇄',
    title: (
      <>
        <strong className="text-paper">{newHandler}</strong> is now Handler of{' '}
        <strong className="text-paper">{campaign}</strong>
      </>
    ),
    body: 'You are now an Agent in this campaign.',
    openTo: `/campaigns/${p.campaign_id}/operations`,
    openLabel: 'Open campaign',
  };
}

function KindIcon({
  glyph,
  dimmed,
  unread,
}: {
  glyph: string;
  dimmed: boolean;
  unread: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center w-6 h-6 border',
        unread && !dimmed
          ? 'border-green-accent text-green-accent bg-green-accent/[0.06]'
          : 'border-green-dim/60 text-green-mid',
        'font-ui text-[12px]',
      ].join(' ')}
    >
      {glyph}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'JUST NOW';
  if (diffMin < 60) return `${diffMin} MIN AGO`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} HR AGO`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} D AGO`;
  return d
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '·');
}

/* -------------------------------------------------------------------------- */
/*  Loading / error / empty                                                   */
/* -------------------------------------------------------------------------- */

function LoadingCard() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
        Loading inbox…
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/70 tracking-[0.1em] uppercase">
        Decrypting signals
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="border border-red-faded bg-red-faded/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-red-stamp text-sm uppercase tracking-widest">
        Transmission failed
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/80 tracking-[0.1em] uppercase">
        Could not load your inbox. Reload the page to retry.
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="border border-dashed border-green-dim bg-desk-edge px-8 py-10 max-w-xl flex flex-col items-center gap-3 text-center">
      <div className="font-display text-[18px] tracking-[0.18em] uppercase text-paper">
        Inbox clear
      </div>
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/80 max-w-sm">
        Pending invites, join-request approvals/declines, and other campaign signals show up here.
      </p>
      <Link
        to="/"
        className={[
          'mt-2 font-ui text-[10px] tracking-[0.22em] uppercase px-3 py-[7px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Back to campaigns
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Button classes                                                            */
/* -------------------------------------------------------------------------- */

const markAllReadClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
].join(' ');

const openButtonClass = [
  'font-ui text-[10px] tracking-[0.18em] uppercase px-3 py-[6px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_10px_rgba(116,176,110,0.18)]',
].join(' ');

const dismissButtonClass = [
  'font-ui text-[10px] tracking-[0.18em] uppercase px-3 py-[6px]',
  'text-green-mid border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
].join(' ');
