/**
 * Write operations for the Handler ownership-transfer flow (DEL-49).
 *
 * Mirror of `@/lib/members/mutations`: Result-returning, shared PostgREST
 * error mapping, no throws.
 *
 * Three paths:
 *
 *   - `createTransfer` — Handler inserts a `campaign_transfers` row. RLS
 *     `gm can insert` + the table CHECK constraints validate the row.
 *     The 23505 conflict on the partial unique
 *     `(campaign_id) where status = 'pending'` is mapped to `conflict`
 *     so the UI can render "already a pending transfer".
 *
 *   - `cancelTransfer` — sender flips a pending row to `cancelled` via the
 *     "sender can update own" RLS policy. No notification (per the
 *     migration header).
 *
 *   - `declineTransfer` — recipient flips a pending row to `declined`
 *     via the "recipient can update own" RLS policy. The
 *     `notify_on_transfer_decline` trigger fans the
 *     `handler_transfer_declined` notification to the sender in the same
 *     transaction.
 *
 *   - `acceptTransfer` — recipient calls the `accept_handler_transfer`
 *     RPC. Routes through a security-definer RPC because the role swap
 *     touches three tables and must preserve the one-Handler-per-campaign
 *     invariant atomically.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type { CampaignTransfer } from '@/types/transfers';

/* -------------------------------------------------------------------------- */
/*  Create                                                                    */
/* -------------------------------------------------------------------------- */

export type CreateTransferInput = {
  campaignId: string;
  toUserId: string;
  message?: string | null;
};

/**
 * Insert a pending `campaign_transfers` row. `from_user_id` is taken from
 * the active Supabase session inside the function so callers can't forge
 * it; the RLS `with check` also requires `from_user_id = auth.uid()` as
 * belt-and-braces.
 *
 * Error variants:
 *   - `conflict`  — partial unique fired (already a pending transfer for
 *                   this campaign). UI shows the existing-pending banner.
 *   - `forbidden` — RLS denied (caller isn't the Handler).
 *   - `unknown`   — everything else, including the
 *                   `campaign_transfers_from_to_distinct` CHECK if a
 *                   malformed call somehow sets `to_user_id = auth.uid()`.
 */
export async function createTransfer(
  input: CreateTransferInput,
): Promise<Result<CampaignTransfer>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const row = {
    campaign_id: input.campaignId,
    from_user_id: userId,
    to_user_id: input.toUserId,
    message: input.message ?? null,
  };

  const { data, error } = await supabase
    .from('campaign_transfers')
    .insert(row)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data);
}

/* -------------------------------------------------------------------------- */
/*  Sender — cancel                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Flip a pending transfer to `cancelled` and stamp `resolved_at`. RLS
 * scopes to the sender. The trigger fires but the decline-only check at
 * its top short-circuits, so no notification is emitted (intentional —
 * see migration header).
 */
export async function cancelTransfer(
  transferId: string,
): Promise<Result<CampaignTransfer>> {
  const { data, error } = await supabase
    .from('campaign_transfers')
    .update({
      status: 'cancelled',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', transferId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data);
}

/* -------------------------------------------------------------------------- */
/*  Recipient — decline                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Flip a pending transfer to `declined` and stamp `resolved_at`. RLS
 * scopes to the recipient. The `notify_on_transfer_decline` trigger fires
 * the `handler_transfer_declined` notification to the original sender.
 */
export async function declineTransfer(
  transferId: string,
): Promise<Result<CampaignTransfer>> {
  const { data, error } = await supabase
    .from('campaign_transfers')
    .update({
      status: 'declined',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', transferId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data);
}

/* -------------------------------------------------------------------------- */
/*  Recipient — accept                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Outcome of `accept_handler_transfer`. The RPC returns a discriminator
 * string; we lift it into a typed union so the UI doesn't have to compare
 * raw strings.
 *
 *   - `accepted`       — role swap landed; recipient is the new Handler.
 *   - `gone`           — transfer not pending (cancelled, declined,
 *                        already accepted), or sender no longer the
 *                        Handler, or recipient no longer an active member.
 *                        UI renders the `gone` variant of the screen.
 *   - `not_recipient`  — caller is not the row's `to_user_id`. Should be
 *                        unreachable through normal navigation (the link
 *                        comes from the recipient's own notification).
 *   - `deleted`        — campaign was soft-deleted. UI renders the
 *                        `deleted` variant.
 */
export type AcceptTransferOutcome =
  | 'accepted'
  | 'gone'
  | 'not_recipient'
  | 'deleted';

export async function acceptTransfer(
  transferId: string,
): Promise<Result<AcceptTransferOutcome>> {
  const { data, error } = await supabase.rpc('accept_handler_transfer', {
    p_transfer_id: transferId,
  });

  if (error) return mapPostgrestError(error);

  if (
    data === 'accepted' ||
    data === 'gone' ||
    data === 'not_recipient' ||
    data === 'deleted'
  ) {
    return ok(data);
  }

  return unknown(
    new Error(`Unexpected accept_handler_transfer outcome: ${String(data)}`),
  );
}
