/**
 * Notification feed writes.
 *
 * Two mutations only:
 *   - `markAllNotificationsRead()` — bulk `read_at = now()` on the caller's
 *     unread rows. RLS update policy (`user_id = auth.uid()`) scopes the
 *     update to the caller's rows.
 *   - `markNotificationRead(id)` — set `read_at = now()` for a single row.
 *     The page uses this on row-click so navigating to a source also
 *     marks the row read.
 *   - `dismissNotification(id)` — hard DELETE. Notifications are an audit
 *     feed, not user content; we don't soft-delete (per DEL-35 design).
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, type Result } from '@/lib/records/errors';

/**
 * Mark every unread notification owned by the caller as read. Returns the
 * count of rows touched so the UI can announce the result. A second call
 * with no unread rows is a no-op and returns 0.
 */
export async function markAllNotificationsRead(): Promise<Result<{ marked: number }>> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .select('id');

  if (error) return mapPostgrestError(error);
  return ok({ marked: (data ?? []).length });
}

/**
 * Mark a single notification as read. Idempotent — running on an already-
 * read row matches zero rows (`read_at is null` filter) and returns
 * `{ updated: false }`.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<Result<{ updated: boolean }>> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)
    .select('id');

  if (error) return mapPostgrestError(error);
  return ok({ updated: (data ?? []).length > 0 });
}

/**
 * Hard-delete a notification. The RLS delete policy
 * (`user_id = auth.uid()`) prevents deleting other users' rows.
 */
export async function dismissNotification(
  notificationId: string,
): Promise<Result<null>> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) return mapPostgrestError(error);
  return ok(null);
}
