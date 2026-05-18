/**
 * Member-related row shapes for the Members management screen (DEL-44).
 *
 * Mirrors the deployed Supabase tables `campaign_members` (extended in
 * `20260517120000_extend_campaign_members_with_status.sql`),
 * `campaign_invitations`, and `user_profiles`. Snake_case is preserved
 * because every read goes through PostgREST.
 *
 * The "with profile" variants are what the UI actually consumes — the
 * raw `campaign_members` row only carries `user_id`, not the username.
 * The data layer fetches profiles in a second query (mirroring the
 * `getMemberCountsByCampaign` pattern) and merges them in.
 */

export type CampaignMemberRole = 'gm' | 'player';
export type CampaignMemberStatus = 'active' | 'former';

/** Raw `campaign_members` row. */
export type CampaignMember = {
  id: string;
  campaign_id: string;
  user_id: string;
  role: CampaignMemberRole;
  status: CampaignMemberStatus;
  left_at: string | null;
  created_at: string;
};

/** Public-readable slice of `user_profiles` — just what the screen renders. */
export type UserProfileSummary = {
  user_id: string;
  username: string;
};

/**
 * `campaign_members` row enriched with the user's public profile. `username`
 * is nullable because the profile is fetched in a separate query and the
 * merge can miss if a profile row is unexpectedly absent (it always exists
 * in practice — the auth.users insert trigger backfills new signups).
 */
export type CampaignMemberWithProfile = CampaignMember & {
  username: string | null;
};

export type CampaignInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired';

/** Raw `campaign_invitations` row, slim — only what the Members screen needs. */
export type CampaignInvitation = {
  id: string;
  campaign_id: string;
  invited_by: string;
  invitee_user_id: string | null;
  invitee_email: string | null;
  message: string | null;
  status: CampaignInvitationStatus;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Pending invitation enriched with the invitee's public username when the
 * invitation is to an existing user. For stranger / email invites the
 * row carries `invitee_email` instead; `username` stays null.
 */
export type PendingInvitationWithProfile = CampaignInvitation & {
  username: string | null;
};

/**
 * Public view returned by the `get_invitation_by_token` RPC (DEL-34) —
 * the only surface the unauthenticated magic-link landing can read. Keeps
 * the field set tight; nothing here exposes invitee identity.
 */
export type InvitationByToken = {
  campaign_name: string;
  inviter_handle: string;
  status: CampaignInvitationStatus;
  expires_at: string;
  message: string | null;
  invitee_email: string;
};

/**
 * Return shape of `claim_invitation_by_token` (DEL-45). Empty result =>
 * the token wasn't claimable (wrong email, expired, already resolved,
 * etc.); the caller falls back to a fresh `getInvitationByToken` to
 * render the right `InviteGoneScreen` variant.
 */
export type InvitationClaimResult = {
  invitation_id: string;
  campaign_id: string;
};
