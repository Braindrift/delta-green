/**
 * Notification feed reads.
 *
 * The `notifications` table is RLS-scoped to `user_id = auth.uid()` (DEL-35),
 * so a bare SELECT already returns only the caller's rows. We order by
 * `created_at desc` so the inbox renders newest-first.
 *
 * `kind` is a literal union at the DB level (CHECK constraint), but the
 * client can lag the DB if a new kind ships in a migration the frontend
 * hasn't been redeployed for. Rows with unknown kinds are filtered out
 * silently rather than surfaced as errors — the inbox renders the rest,
 * and a redeploy picks the new kind up.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, type Result } from '@/lib/records/errors';
import { NOTIFICATION_KINDS, type Notification } from '@/types/notifications';

const KIND_SET: ReadonlySet<string> = new Set(NOTIFICATION_KINDS);

/**
 * List all notifications for the calling user, newest-first. Unknown kinds
 * (forward-compat: DB constraint added a kind the client doesn't know yet)
 * are dropped silently so the rest of the inbox still renders.
 */
export async function listNotifications(): Promise<Result<Notification[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, kind, source_kind, source_id, payload, read_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return mapPostgrestError(error);

  const notifications: Notification[] = [];
  for (const row of data ?? []) {
    if (!KIND_SET.has(row.kind)) continue;
    // The typed client gives `kind: NotificationKind` and `payload: Json`. The
    // remaining `as Notification` is a discriminated-union *assembly*, not a
    // raw row cast: the kind↔payload correlation can't be inferred from a flat
    // row, so we re-state the shape the DB trigger guarantees per kind.
    notifications.push({
      id: row.id,
      user_id: row.user_id,
      kind: row.kind,
      source_kind: row.source_kind,
      source_id: row.source_id,
      payload: (row.payload ?? {}) as Notification['payload'],
      read_at: row.read_at,
      created_at: row.created_at,
    } as Notification);
  }
  return ok(notifications);
}

/**
 * Count unread notifications for the calling user. Uses a head request +
 * exact count so we don't transfer row payloads we don't need.
 *
 * Note: the count is not filtered by known-kind. An unknown future kind
 * still contributes to the badge — that's fine; it's still an unread row
 * for this user, and the inbox will show it once the client catches up.
 */
export async function countUnreadNotifications(): Promise<Result<number>> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) return mapPostgrestError(error);
  return ok(count ?? 0);
}
