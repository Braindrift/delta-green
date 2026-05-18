/**
 * Magic-link invite token queries.
 *
 * Read-only access to a `campaign_invitations` row via its single-use token.
 * Goes through the `get_invitation_by_token` security-definer RPC (DEL-34)
 * so the call works for unauthenticated visitors — the table itself is
 * inaccessible to `anon`, and the RPC returns only the minimum fields the
 * landing page needs.
 *
 * The RPC returns zero rows for unknown tokens, non-stranger tokens (no
 * `invitee_email`), or tokens whose row has been deleted. We map zero
 * rows to `ok(null)` so the caller has a single "this token doesn't
 * resolve" branch to handle.
 *
 * Status-vs-expiry is intentionally NOT filtered server-side: the caller
 * needs the real status + `expires_at` to pick the correct
 * `InviteGoneScreen` variant (revoked / expired / accepted / declined).
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type { InvitationByToken, CampaignInvitationStatus } from '@/types/members';

type RawInvitationByToken = {
  campaign_name: string;
  inviter_handle: string;
  status: string;
  expires_at: string;
  message: string | null;
  invitee_email: string;
};

/**
 * Resolve an invite token to its display payload. Returns `ok(null)` when
 * the token doesn't match a known stranger invite.
 */
export async function getInvitationByToken(
  token: string,
): Promise<Result<InvitationByToken | null>> {
  const trimmed = token.trim();
  if (trimmed === '') return ok(null);

  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    p_token: trimmed,
  });

  if (error) return mapPostgrestError(error);

  // PostgREST returns the rowset as an array. The RPC's WHERE clause can
  // match zero or one row; treat empty as "token not found".
  const rows = (data ?? []) as RawInvitationByToken[];
  if (rows.length === 0) return ok(null);

  const row = rows[0];
  if (!isKnownStatus(row.status)) {
    return unknown(new Error(`Unknown invitation status: ${row.status}`));
  }

  return ok({
    campaign_name: row.campaign_name,
    inviter_handle: row.inviter_handle,
    status: row.status,
    expires_at: row.expires_at,
    message: row.message,
    invitee_email: row.invitee_email,
  });
}

const KNOWN_STATUSES: ReadonlyArray<CampaignInvitationStatus> = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
];

function isKnownStatus(value: string): value is CampaignInvitationStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(value);
}
