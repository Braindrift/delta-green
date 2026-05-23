/**
 * Public surface for the magic-link invitation data access layer (DEL-45).
 *
 * Lives alongside `@/lib/members` rather than inside it because these
 * functions serve a different audience: the unauthenticated landing route,
 * post-signup linking, and the mismatch-recovery decline. The Members
 * screen's existing-user invite + revoke writes still live in
 * `@/lib/members`.
 */

export { getInvitationByToken, getInvitationForAccept } from './queries';

export {
  acceptInvitation,
  acceptInvitationWithPc,
  claimInvitationByToken,
  createStrangerInvitation,
  declineInvitation,
  declineInvitationByToken,
  sendInvitationEmail,
  type CreateStrangerInvitationInput,
  type SendInvitationEmailError,
  type SendInvitationEmailErrorKind,
} from './mutations';
