/**
 * Row shapes for the Handler ownership-transfer flow (DEL-49).
 *
 * Mirrors `campaign_transfers` from
 * `20260518213928_add_campaign_transfers_and_transfer_rpcs.sql`. Snake_case
 * preserved — every read goes through PostgREST.
 */

export type CampaignTransferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

/** Raw `campaign_transfers` row. */
export type CampaignTransfer = {
  id: string;
  campaign_id: string;
  from_user_id: string;
  to_user_id: string;
  status: CampaignTransferStatus;
  message: string | null;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Recipient-side enrichment used by the accept screen — pairs the raw row
 * with the sender's display handle and the campaign's name so the screen
 * can render without a second fetch.
 */
export type TransferAcceptView = CampaignTransfer & {
  campaign_name: string;
  from_username: string | null;
};

/**
 * Sender-side enrichment used by the Settings pending-banner — the
 * recipient's handle is what the Handler wants to see.
 */
export type PendingTransferForSender = CampaignTransfer & {
  to_username: string | null;
};
