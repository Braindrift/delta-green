/**
 * Public surface for the campaigns data access layer.
 *
 * Consumers should import from `@/lib/campaigns` rather than reaching into
 * the per-module files. This file is the contract — when the layer grows
 * (list, create, soft-delete, transfer) the new functions are re-exported
 * from here.
 */

export {
  getCampaignById,
  getMemberCountsByCampaign,
  getMyRoleInCampaign,
  listCampaigns,
  listMyMemberships,
  type CampaignRole,
} from './queries';

export {
  checkCampaignNameAvailable,
  createCampaign,
  softDeleteCampaign,
  type CreateCampaignInput,
} from './mutations';
