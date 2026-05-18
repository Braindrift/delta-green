/**
 * Public surface for the Handler ownership-transfer data layer (DEL-49).
 *
 * Mirror of `@/lib/members` — consumers import from `@/lib/transfers`
 * rather than reaching into per-module files.
 */

export {
  getPendingTransferForCampaign,
  getTransferForRecipient,
  listActiveNonHandlerMembers,
} from './queries';

export {
  acceptTransfer,
  cancelTransfer,
  createTransfer,
  declineTransfer,
  type AcceptTransferOutcome,
  type CreateTransferInput,
} from './mutations';
