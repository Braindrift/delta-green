/**
 * Magic-link invite token mutations.
 *
 * Two security-definer RPCs (`claim_invitation_by_token`,
 * `decline_invitation_by_token` — DEL-45) plus the
 * `send-invitation-email` edge function (DEL-45). The RPCs require an
 * authenticated caller; the claim path additionally requires the caller's
 * email to match `invitee_email`.
 *
 * Empty RPC results are mapped to `ok(null)` rather than an error: the
 * caller's natural recovery is to re-fetch the invitation via
 * `getInvitationByToken` and render the matching `InviteGoneScreen`
 * variant, not to bubble an unknown error.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, type Result } from '@/lib/records/errors';
import type { CampaignInvitation, InvitationClaimResult } from '@/types/members';

/* -------------------------------------------------------------------------- */
/*  Stranger-invite insert                                                    */
/* -------------------------------------------------------------------------- */

export type CreateStrangerInvitationInput = {
  campaignId: string;
  inviteeEmail: string;
  message?: string | null;
};

/**
 * Insert a stranger invite — `invitee_email` set, `invitee_user_id` null.
 * The `set_invitation_token` trigger (DEL-34) populates `token` server-side,
 * so the inserted row already carries the magic-link token.
 *
 * RLS:
 *   - `campaign_invitations: gm can insert` (DEL-34) requires the caller
 *     to be the campaign's Handler. `with check` also requires
 *     `invited_by = auth.uid()` — set from the session here so callers
 *     cannot forge.
 *
 * Error variants:
 *   - `conflict` (Postgres 23505) — the partial unique
 *     `(campaign_id, invitee_email) WHERE status = 'pending'` fired. The
 *     UI treats this the same as the existing-user "Already invited"
 *     conflict.
 *   - `forbidden` — RLS denied.
 *   - `unknown` — everything else.
 */
export async function createStrangerInvitation(
  input: CreateStrangerInvitationInput,
): Promise<Result<CampaignInvitation>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return { ok: false, kind: 'unknown', cause: new Error('No authenticated session') };
  }

  // Lowercase the email so the partial-unique index and the
  // `find_user_by_email` lookup share a normalised form. The DB doesn't
  // enforce lowercase storage on `invitee_email`, so this is a
  // client-side convention.
  const normalisedEmail = input.inviteeEmail.trim().toLowerCase();

  const row = {
    campaign_id: input.campaignId,
    invited_by: userId,
    invitee_user_id: null,
    invitee_email: normalisedEmail,
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
/*  Claim                                                                     */
/* -------------------------------------------------------------------------- */

type RawClaimRow = {
  invitation_id: string;
  campaign_id: string;
};

/**
 * Try to claim a stranger invite for the currently-authenticated user. The
 * RPC verifies (auth.uid(), auth.users.email) match (invitee_email,
 * still-pending, not expired); empty result => not claimable.
 */
export async function claimInvitationByToken(
  token: string,
): Promise<Result<InvitationClaimResult | null>> {
  const trimmed = token.trim();
  if (trimmed === '') return ok(null);

  const { data, error } = await supabase.rpc('claim_invitation_by_token', {
    p_token: trimmed,
  });

  if (error) return mapPostgrestError(error);

  const rows = (data ?? []) as RawClaimRow[];
  if (rows.length === 0) return ok(null);

  const row = rows[0];
  return ok({
    invitation_id: row.invitation_id,
    campaign_id: row.campaign_id,
  });
}

/* -------------------------------------------------------------------------- */
/*  Decline                                                                   */
/* -------------------------------------------------------------------------- */

type RawDeclineRow = {
  invitation_id: string;
};

/**
 * Decline a stranger invite via the token. Used by the mismatch screen's
 * "Decline this invite" recovery option — the caller is authenticated but
 * not necessarily the original invitee's email, so the RPC trusts the
 * token rather than an `invitee_user_id` match.
 *
 * Returns `ok(null)` when the row is no longer pending (e.g., another
 * tab declined first). The caller refreshes via `getInvitationByToken` to
 * render the matching `InviteGoneScreen` state.
 */
export async function declineInvitationByToken(
  token: string,
): Promise<Result<{ invitation_id: string } | null>> {
  const trimmed = token.trim();
  if (trimmed === '') return ok(null);

  const { data, error } = await supabase.rpc('decline_invitation_by_token', {
    p_token: trimmed,
  });

  if (error) return mapPostgrestError(error);

  const rows = (data ?? []) as RawDeclineRow[];
  if (rows.length === 0) return ok(null);

  return ok({ invitation_id: rows[0].invitation_id });
}

/* -------------------------------------------------------------------------- */
/*  Email dispatch                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Distinct error variants returned by the `send-invitation-email` edge
 * function. Two of these surface a specific UX:
 *
 *   - `not_configured` — Resend env vars unset on the Supabase project.
 *     The invitation row exists; the Handler can share the magic-link
 *     URL manually. Dev-time signal.
 *   - `provider_failed` — Resend returned a non-2xx. Likely a deliverability
 *     issue (unverified sender, bad recipient, rate limit). Same Handler-
 *     can-resend recovery in practice.
 */
export type SendInvitationEmailErrorKind =
  | 'not_configured'
  | 'provider_failed'
  | 'unknown';

export type SendInvitationEmailError = {
  kind: SendInvitationEmailErrorKind;
  detail?: string | null;
};

/**
 * Invoke the `send-invitation-email` edge function. Returns a structured
 * error so the InviteModal can show a specific banner without parsing the
 * raw response.
 */
export async function sendInvitationEmail(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: SendInvitationEmailError }> {
  const { data, error } = await supabase.functions.invoke<{ error?: string }>(
    'send-invitation-email',
    { body: { invitation_id: invitationId } },
  );

  if (error) {
    // `functions.invoke` returns a FunctionsHttpError with `.context`
    // (a Response). The function returns JSON like `{error: "..."}`. We
    // try to read it to map the specific kind; fall back to unknown.
    const raw = await tryReadError(error);
    if (raw?.error === 'email_provider_not_configured') {
      return { ok: false, error: { kind: 'not_configured' } };
    }
    if (raw?.error === 'email_provider_failed') {
      return {
        ok: false,
        error: { kind: 'provider_failed', detail: raw.provider_message ?? null },
      };
    }
    return {
      ok: false,
      error: { kind: 'unknown', detail: error.message },
    };
  }

  // The function returns `{ok: true}` on success. Defensive: anything
  // else from a 2xx is treated as success.
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return {
      ok: false,
      error: { kind: 'unknown', detail: String(data.error) },
    };
  }

  return { ok: true };
}

async function tryReadError(
  err: unknown,
): Promise<{ error?: string; provider_message?: string | null } | null> {
  // `FunctionsHttpError.context` is a Response. Reading it consumes the
  // body, but we only call this on the error path so that's fine.
  type FunctionsHttpErrorLike = { context?: Response };
  const ctx = (err as FunctionsHttpErrorLike).context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    return (await ctx.json()) as {
      error?: string;
      provider_message?: string | null;
    };
  } catch {
    return null;
  }
}
