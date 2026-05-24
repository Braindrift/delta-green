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

/**
 * Raw `campaign_members` row, slim — only the columns the Members screen
 * reads. The live table also carries a `plan` column the UI doesn't surface,
 * so this stays a hand-picked subset rather than the full generated row; the
 * `AppDatabase` override (`src/types/database-overrides.ts`) narrows `role`
 * and `status` from the generated `string` to these literal unions so the
 * typed client returns this shape directly.
 */
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

/**
 * Payload the in-app accept screen (DEL-46) needs to render. Joins the
 * invitation row with its campaign + the inviter's username and the
 * current active-member count, so the page can render the seat counter
 * and the campaign name in a single load.
 *
 * `campaign_deleted_at` lets the screen pick the `'deleted'`
 * `InviteGoneScreen` variant at render time without a second query —
 * the read still goes through RLS, which excludes soft-deleted
 * campaigns for non-members, so a non-null value here would have to be
 * surfaced via a separate path (the RPC's `'deleted'` discriminator).
 */
export type InvitationAcceptView = {
  invitation_id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_max_agents: number;
  campaign_deleted_at: string | null;
  inviter_username: string | null;
  status: CampaignInvitationStatus;
  expires_at: string;
  message: string | null;
  invitee_user_id: string | null;
  active_member_count: number;
};

/**
 * Return shape of `accept_invitation_with_pc` (DEL-46). The function
 * always returns a row; `campaign_id` is only populated when
 * `status === 'accepted'`. Non-accept statuses tell the page which
 * `InviteGoneScreen` variant to render without an extra round-trip.
 */
export type AcceptInvitationResult =
  | { status: 'accepted'; campaign_id: string }
  | { status: 'gone' | 'deleted' | 'full'; campaign_id: null };
