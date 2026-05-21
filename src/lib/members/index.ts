/**
 * Public surface for the members data access layer.
 *
 * Consumers import from `@/lib/members` rather than reaching into the
 * per-module files. Mirrors the `@/lib/campaigns` pattern.
 */

export {
  findUserByEmail,
  getMyMembershipRole,
  listCampaignMembers,
  listPendingInvitations,
  searchUsersByUsername,
} from './queries';

export {
  inviteExistingUser,
  kickMember,
  leaveCampaign,
  revokeInvitation,
  type InviteExistingUserInput,
  type LeaveCampaignOutcome,
} from './mutations';
