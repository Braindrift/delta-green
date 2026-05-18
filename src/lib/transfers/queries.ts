/**
 * Read queries for the Handler ownership-transfer flow (DEL-49).
 *
 * Result-shape per `@/lib/records/errors`; no throws. Three call sites:
 *
 *   1. Settings page — `getPendingTransferForCampaign` answers "is a
 *      transfer already in flight for this campaign?" and feeds the
 *      pending banner. Returns `ok(null)` when no pending row exists.
 *   2. TransferHandlerModal — `listActiveNonHandlerMembers` populates the
 *      recipient picker. Filters `listCampaignMembers` to active +
 *      role='player'.
 *   3. TransferAcceptPage — `getTransferForRecipient` loads one row by id
 *      for the recipient. RLS scopes to `to_user_id = auth.uid()`.
 *
 * Profile enrichment follows the `@/lib/members` pattern: read the base
 * row, then a second query against `user_profiles` to merge usernames.
 * There's no PostgREST-recognised FK between `campaign_transfers` and
 * `user_profiles`, so embedding via `select(...)` isn't available.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, notFound, ok, type Result } from '@/lib/records/errors';
import { listCampaignMembers } from '@/lib/members';
import type { CampaignMemberWithProfile } from '@/types/members';
import type {
  CampaignTransfer,
  PendingTransferForSender,
  TransferAcceptView,
} from '@/types/transfers';

/* -------------------------------------------------------------------------- */
/*  Picker source                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Active members of the campaign with `role = 'player'` — i.e. the set the
 * Handler can transfer ownership to. Reuses `listCampaignMembers` (which
 * already enriches with `user_profiles.username`) and filters in-memory.
 * The Handler is excluded by the `role = 'player'` filter; former members
 * are excluded by the `status = 'active'` filter.
 *
 * Ordered by username ascending so the picker is stable across reloads.
 */
export async function listActiveNonHandlerMembers(
  campaignId: string,
): Promise<Result<CampaignMemberWithProfile[]>> {
  const result = await listCampaignMembers(campaignId);
  if (!result.ok) return result;

  const eligible = result.data
    .filter((m) => m.status === 'active' && m.role === 'player')
    .sort((a, b) => {
      const an = a.username ?? '';
      const bn = b.username ?? '';
      return an.localeCompare(bn);
    });

  return ok(eligible);
}

/* -------------------------------------------------------------------------- */
/*  Settings pending banner                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The currently-pending transfer for this campaign, if any. The partial
 * unique index on `(campaign_id) where status = 'pending'` guarantees at
 * most one — `.maybeSingle()` returns null when there isn't one. RLS
 * `sender can read own` makes this visible to the Handler.
 *
 * `to_username` is fetched in a follow-up query against `user_profiles`
 * (no embedded select available — see header).
 */
export async function getPendingTransferForCampaign(
  campaignId: string,
): Promise<Result<PendingTransferForSender | null>> {
  const { data, error } = await supabase
    .from('campaign_transfers')
    .select('id, campaign_id, from_user_id, to_user_id, status, message, created_at, resolved_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return ok(null);

  const row = data as CampaignTransfer;

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', row.to_user_id)
    .maybeSingle();

  if (profileError) return mapPostgrestError(profileError);

  return ok({
    ...row,
    to_username: (profile as { username: string } | null)?.username ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/*  Recipient accept screen                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Load a transfer row + the campaign name + the sender's handle in a small
 * fan-out. The recipient screen renders all three at once, so doing a
 * single base read + two lookups is the right shape (matches the
 * `getInvitationForAccept` pattern in `@/lib/invitations`).
 *
 * Returns `not_found` when the row is invisible to the caller. RLS hides
 * rows where the caller is neither sender nor recipient, so a stranger
 * who guesses an id can't probe existence — and the recipient sees the
 * actual row.
 */
export async function getTransferForRecipient(
  transferId: string,
): Promise<Result<TransferAcceptView>> {
  const { data, error } = await supabase
    .from('campaign_transfers')
    .select('id, campaign_id, from_user_id, to_user_id, status, message, created_at, resolved_at')
    .eq('id', transferId)
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return notFound();

  const row = data as CampaignTransfer;

  // Campaign name. `campaigns: members can read` requires `deleted_at is
  // null`, so a soft-deleted campaign returns null here — the screen maps
  // that to its `deleted` variant. Sender (Handler) sees the row through
  // the same policy; recipient must be an active member to see it. If the
  // member-read is hidden (kicked between insert and accept) we still
  // surface the transfer row but with `null` campaign name — the accept
  // RPC will return `gone` and the UI falls through.
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('name')
    .eq('id', row.campaign_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (campaignError) return mapPostgrestError(campaignError);

  const { data: senderProfile, error: senderError } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', row.from_user_id)
    .maybeSingle();

  if (senderError) return mapPostgrestError(senderError);

  return ok({
    ...row,
    campaign_name: (campaign as { name: string } | null)?.name ?? '',
    from_username:
      (senderProfile as { username: string } | null)?.username ?? null,
  });
}
