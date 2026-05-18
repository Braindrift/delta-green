/**
 * Member-screen write operations against the deployed Supabase tables.
 *
 * Mirrors `@/lib/campaigns/mutations`: Result-returning, shared PostgREST
 * error mapping, no throws. RLS does the heavy lifting — `campaign_members
 * .gm can update` and `campaign_invitations.gm can insert / update` policies
 * (added in the initial schema + DEL-34 / DEL-36 migrations) gate each
 * write to the campaign's active Handler.
 *
 * RLS posture recap:
 *   - `inviteExistingUser` inserts a row with `invitee_user_id` set. The
 *     CHECK constraint (`campaign_invitations_invitee_xor`) enforces the
 *     "user OR email" rule at the DB. The `set_invitation_token` trigger
 *     leaves `token` null for existing-user invites; magic-link tokens are
 *     stranger-only.
 *   - `revokeInvitation` updates `status = 'revoked'` and stamps
 *     `resolved_at`. The partial unique on `(campaign_id, invitee_user_id)
 *     WHERE status = 'pending'` releases the slot so a fresh invite can
 *     follow.
 *   - `kickMember` updates `campaign_members.status = 'former'` and
 *     `left_at = now()`. The trigger added in
 *     `20260518100000_member_kick_pc_demote_and_email_lookup.sql` cascades
 *     the kicked user's attached PC to `status = 'former'` in the same
 *     transaction.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type { CampaignInvitation, CampaignMember } from '@/types/members';

/* -------------------------------------------------------------------------- */
/*  Invitations — insert                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Insert an existing-user invitation. `invited_by` is taken from the active
 * Supabase session inside the function so callers cannot forge it; the RLS
 * `with check` also requires `invited_by = auth.uid()` as a belt-and-braces
 * guard.
 *
 * Error variants:
 *   - `conflict` (Postgres `23505`) — the partial unique
 *     `(campaign_id, invitee_user_id) WHERE status = 'pending'` fired,
 *     meaning a pending invite to that user for that campaign already
 *     exists. The UI swaps to the "Already invited" conflict view.
 *   - `forbidden` — RLS denied the insert (e.g., the caller isn't the
 *     campaign's Handler).
 *   - `unknown` — everything else.
 */
export type InviteExistingUserInput = {
  campaignId: string;
  inviteeUserId: string;
  message?: string | null;
};

export async function inviteExistingUser(
  input: InviteExistingUserInput,
): Promise<Result<CampaignInvitation>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const row = {
    campaign_id: input.campaignId,
    invited_by: userId,
    invitee_user_id: input.inviteeUserId,
    invitee_email: null,
    message: input.message ?? null,
  };

  const { data, error } = await supabase
    .from('campaign_invitations')
    .insert(row)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as CampaignInvitation);
}

/* -------------------------------------------------------------------------- */
/*  Invitations — revoke                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Flip a pending invitation to `revoked` and stamp `resolved_at`. Preferred
 * over hard DELETE so audit history is preserved and the notifications
 * triggers (DEL-35) can fan out on the status change.
 *
 * Returns the updated row on success. RLS limits this to the campaign's
 * Handler.
 */
export async function revokeInvitation(
  invitationId: string,
): Promise<Result<CampaignInvitation>> {
  const { data, error } = await supabase
    .from('campaign_invitations')
    .update({
      status: 'revoked',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as CampaignInvitation);
}

/* -------------------------------------------------------------------------- */
/*  Members — Handler kick                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Flip a `campaign_members` row from active → former and stamp `left_at`.
 * The `demote_pc_on_member_former` trigger picks up the status change in
 * the same transaction and demotes the kicked user's attached PC.
 *
 * RLS:
 *   - `campaign_members: gm can update` (initial schema) lets the campaign
 *     Handler update any member row in their campaign.
 *
 * Returns the updated row on success. The caller is responsible for not
 * invoking this on the Handler's own row — there's no schema-level guard,
 * but the UI never renders the "Remove" menu on the Handler's own row.
 */
export async function kickMember(memberId: string): Promise<Result<CampaignMember>> {
  const { data, error } = await supabase
    .from('campaign_members')
    .update({
      status: 'former',
      left_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as CampaignMember);
}
