/**
 * Notifications feed provider for the Workspace shell (DEL-50).
 *
 * Holds the caller's full notification list and keeps it live via a
 * Supabase realtime channel filtered to `user_id = auth.uid()`. The
 * sidebar reads the derived unread count for its badge; the inbox page
 * reads the list. Both share one subscription so we don't end up with
 * two parallel feeds.
 *
 * The provider sits inside `ProtectedRoute`, so `useAuth().user` is
 * guaranteed non-null by the time the effect runs. We resubscribe when
 * the user id changes (signout → signin races, account switching).
 *
 * Mutations (`markAll`, `markOne`, `dismiss`) go through the data layer
 * but we *also* apply an optimistic local patch so the UI doesn't have
 * to wait for the realtime echo to feel responsive. The realtime UPDATE
 * / DELETE event arrives shortly after and reconciles — if our local
 * patch was wrong, the server's version wins.
 *
 * Realtime filtering: postgres_changes accepts a `filter: 'user_id=eq.<uid>'`
 * predicate evaluated server-side, so we don't see other users' inserts
 * even though the channel is per-user. RLS would block those anyway,
 * but the filter saves bandwidth.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  dismissNotification as apiDismiss,
  listNotifications,
  markAllNotificationsRead as apiMarkAll,
  markNotificationRead as apiMarkOne,
} from '@/lib/notifications';
import {
  NOTIFICATION_KINDS,
  type Notification,
  type NotificationKind,
} from '@/types/notifications';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; notifications: Notification[] };

type NotificationsContextValue = {
  state: FeedState;
  unreadCount: number;
  reload: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const KIND_SET: ReadonlySet<string> = new Set(NOTIFICATION_KINDS);

type RawNotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  source_kind: string;
  source_id: string;
  payload: unknown;
  read_at: string | null;
  created_at: string;
};

function rowToNotification(row: RawNotificationRow): Notification | null {
  if (!KIND_SET.has(row.kind)) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind as NotificationKind,
    source_kind: row.source_kind,
    source_id: row.source_id,
    payload: (row.payload ?? {}) as Notification['payload'],
    read_at: row.read_at,
    created_at: row.created_at,
  } as Notification;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [state, setState] = useState<FeedState>({ kind: 'loading' });

  // Mutable handle to the current list so the realtime callback can
  // reconcile without re-subscribing on every state update.
  const listRef = useRef<Notification[]>([]);
  const setList = useCallback((next: Notification[]) => {
    listRef.current = next;
    setState({ kind: 'ready', notifications: next });
  }, []);

  const reload = useCallback(async () => {
    if (!userId) return;
    const result = await listNotifications();
    if (!result.ok) {
      setState({ kind: 'error' });
      return;
    }
    setList(result.data);
  }, [userId, setList]);

  // Initial fetch — fires when the user becomes known. The provider lives
  // inside ProtectedRoute, so `userId` is non-null at mount; on logout the
  // route guard unmounts us before this effect needs to handle a null id.
  // Deferred via a microtask so the inner `setState({ kind: 'loading' })`
  // doesn't land on the same render pass as the effect (matches the
  // pattern used in WorkspaceAgentsPage).
  useEffect(() => {
    if (!userId) return;
    void Promise.resolve().then(() => reload());
  }, [userId, reload]);

  // Realtime subscription. One channel per user; resubscribe on user change.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        // The `supabase-js` realtime helper types `on('postgres_changes', ...)`
        // tightly enough that the literal here is rejected unless we widen.
        // The runtime shape is what matters; the cast keeps the call site
        // legible.
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<RawNotificationRow>) => {
          const current = listRef.current;
          if (payload.eventType === 'INSERT') {
            const next = rowToNotification(payload.new as RawNotificationRow);
            if (!next) return;
            // De-dupe in case the row is already present (e.g., the user
            // triggered an action that immediately inserted and the
            // initial fetch overlapped the channel join).
            if (current.some((n) => n.id === next.id)) return;
            setList([next, ...current]);
            return;
          }
          if (payload.eventType === 'UPDATE') {
            const next = rowToNotification(payload.new as RawNotificationRow);
            if (!next) return;
            setList(current.map((n) => (n.id === next.id ? next : n)));
            return;
          }
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<RawNotificationRow>;
            if (!oldRow?.id) return;
            setList(current.filter((n) => n.id !== oldRow.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, setList]);

  /* ----------------------------------------------------------------------- */
  /*  Mutations — optimistic local patch, then DB write                      */
  /* ----------------------------------------------------------------------- */

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    const before = listRef.current;
    setList(before.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const result = await apiMarkAll();
    if (!result.ok) {
      // Roll back on failure.
      setList(before);
    }
  }, [setList]);

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const before = listRef.current;
      const target = before.find((n) => n.id === id);
      if (!target || target.read_at) return;
      setList(before.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
      const result = await apiMarkOne(id);
      if (!result.ok) {
        setList(before);
      }
    },
    [setList],
  );

  const dismiss = useCallback(
    async (id: string) => {
      const before = listRef.current;
      if (!before.some((n) => n.id === id)) return;
      setList(before.filter((n) => n.id !== id));
      const result = await apiDismiss(id);
      if (!result.ok) {
        setList(before);
      }
    },
    [setList],
  );

  const unreadCount = useMemo(() => {
    if (state.kind !== 'ready') return 0;
    return state.notifications.reduce((acc, n) => (n.read_at ? acc : acc + 1), 0);
  }, [state]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ state, unreadCount, reload, markAllRead, markRead, dismiss }),
    [state, unreadCount, reload, markAllRead, markRead, dismiss],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside <NotificationsProvider>');
  }
  return ctx;
}
