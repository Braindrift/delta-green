/**
 * Public surface for the members data access layer.
 *
 * Consumers import from `@/lib/members` rather than reaching into the
 * per-module files. Mirrors the `@/lib/campaigns` pattern.
 */

export {
  findUserByEmail,
  listCampaignMembers,
  listPendingInvitations,
  searchUsersByUsername,
} from './queries';

export {
  inviteExistingUser,
  kickMember,
  revokeInvitation,
  type InviteExistingUserInput,
} from './mutations';
