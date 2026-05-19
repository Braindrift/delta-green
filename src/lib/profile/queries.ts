/**
 * Read + write access to the caller's own `user_profiles` row.
 *
 * The username-edit UI on the workspace Profile screen (DEL-55) is the only
 * caller in v1. Both functions return the Result shape from
 * `@/lib/records/errors`; `updateMyUsername` relies on `mapPostgrestError`
 * mapping Postgres `23505` (unique_violation) to `conflict`, which is what
 * lets the screen render the "Username already taken." inline error
 * distinct from generic failures.
 *
 * RLS for these calls lives in `20260518090000_add_user_profiles_table.sql`
 * (DEL-37): `select` is open to all authenticated users, `update` is
 * restricted to `user_id = auth.uid()` with a matching `with check`. The
 * client doesn't need to scope by `auth.uid()` for security — passing it
 * here is just so the query can find the row by its primary key.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, type Result } from '@/lib/records/errors';
import type { UserProfileSummary } from '@/types/members';

export async function getMyUserProfile(
  userId: string,
): Promise<Result<UserProfileSummary>> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, username')
    .eq('user_id', userId)
    .single();

  if (error) return mapPostgrestError(error);

  return ok({
    user_id: (data as { user_id: string }).user_id,
    username: (data as { username: string }).username,
  });
}

export async function updateMyUsername(
  userId: string,
  username: string,
): Promise<Result<UserProfileSummary>> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ username })
    .eq('user_id', userId)
    .select('user_id, username')
    .single();

  if (error) return mapPostgrestError(error);

  return ok({
    user_id: (data as { user_id: string }).user_id,
    username: (data as { username: string }).username,
  });
}
