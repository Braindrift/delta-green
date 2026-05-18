/**
 * Notification feed types.
 *
 * Mirrors the `notifications` table introduced in DEL-35 and extended for
 * the transfer flow in DEL-49. The set of kinds is closed at the DB level
 * (CHECK constraint on `notifications.kind`); we duplicate it here as a
 * literal union so the inbox can render a per-kind row exhaustively.
 *
 * Payloads are denormalised at trigger time — a campaign rename or display-
 * name change after the trigger fires does NOT propagate. Field shapes
 * below are the source-of-truth contract between the trigger functions
 * and the inbox page; if a trigger changes, both ends need updating.
 *
 * Unknown / future kinds returned by the API are filtered out by the
 * query layer rather than surfaced as render errors — forward-compat with
 * kinds added in later migrations that haven't reached the client yet.
 */
export const NOTIFICATION_KINDS = [
  'invite_received',
  'invite_accepted',
  'invite_declined',
  'campaign_deleted',
  'handler_transferred',
  'handler_transfer_requested',
  'handler_transfer_declined',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Per-kind payload shapes                                                   */
/* -------------------------------------------------------------------------- */

export type InviteReceivedPayload = {
  campaign_id: string;
  campaign_name: string | null;
  inviter_username: string | null;
  invitation_id: string;
};

export type InviteAcceptedPayload = {
  campaign_id: string;
  campaign_name: string | null;
  invitee_username: string | null;
};

export type InviteDeclinedPayload = InviteAcceptedPayload;

export type CampaignDeletedPayload = {
  campaign_id: string;
  campaign_name: string | null;
  deleted_by_username: string | null;
};

export type HandlerTransferRequestedPayload = {
  campaign_id: string;
  campaign_name: string | null;
  from_username: string | null;
  transfer_id: string;
};

export type HandlerTransferDeclinedPayload = {
  campaign_id: string;
  campaign_name: string | null;
  recipient_username: string | null;
};

export type HandlerTransferredPayload = {
  campaign_id: string;
  campaign_name: string | null;
  new_handler_username: string | null;
  former_handler_username: string | null;
};

/**
 * Discriminated union keyed on `kind`. Lets the inbox switch over `kind`
 * and get the right payload narrowing inside each branch.
 */
export type Notification =
  | NotificationBase<'invite_received', InviteReceivedPayload>
  | NotificationBase<'invite_accepted', InviteAcceptedPayload>
  | NotificationBase<'invite_declined', InviteDeclinedPayload>
  | NotificationBase<'campaign_deleted', CampaignDeletedPayload>
  | NotificationBase<'handler_transfer_requested', HandlerTransferRequestedPayload>
  | NotificationBase<'handler_transfer_declined', HandlerTransferDeclinedPayload>
  | NotificationBase<'handler_transferred', HandlerTransferredPayload>;

type NotificationBase<K extends NotificationKind, P> = {
  id: string;
  user_id: string;
  kind: K;
  source_kind: string;
  source_id: string;
  payload: P;
  read_at: string | null;
  created_at: string;
};
