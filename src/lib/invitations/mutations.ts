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
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type {
  AcceptInvitationResult,
  CampaignInvitation,
  InvitationClaimResult,
} from '@/types/members';

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
    return unknown(new Error('No authenticated session'));
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
  return ok(data);
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
/*  Accept (in-app, with PC)                                                  */
/* -------------------------------------------------------------------------- */

type RawAcceptRow = {
  campaign_id: string | null;
  status: string;
};

const ACCEPT_STATUSES = new Set<AcceptInvitationResult['status']>([
  'accepted',
  'gone',
  'deleted',
  'full',
]);

/**
 * Call the `accept_invitation_with_pc` RPC (DEL-46). The RPC is atomic:
 * status flip + member upsert + PC attach all land or none do. It always
 * returns exactly one row; `campaign_id` is null on the non-accepted
 * branches and the `status` discriminator tells the caller which
 * `InviteGoneScreen` variant to render without a refetch.
 */
export async function acceptInvitationWithPc(
  invitationId: string,
  pcId: string,
): Promise<Result<AcceptInvitationResult>> {
  const { data, error } = await supabase.rpc('accept_invitation_with_pc', {
    p_invitation_id: invitationId,
    p_pc_id: pcId,
  });

  if (error) return mapPostgrestError(error);

  const rows = (data ?? []) as RawAcceptRow[];
  if (rows.length === 0) {
    return unknown(new Error('accept_invitation_with_pc returned no rows'));
  }

  const row = rows[0];
  if (!ACCEPT_STATUSES.has(row.status as AcceptInvitationResult['status'])) {
    return unknown(new Error(`Unexpected accept status: ${row.status}`));
  }

  if (row.status === 'accepted') {
    if (!row.campaign_id) {
      return unknown(new Error('Accepted invitation returned null campaign_id'));
    }
    return ok({ status: 'accepted', campaign_id: row.campaign_id });
  }

  return ok({
    status: row.status as 'gone' | 'deleted' | 'full',
    campaign_id: null,
  });
}

/* -------------------------------------------------------------------------- */
/*  Accept (in-app, no PC) — DEL-81                                           */
/* -------------------------------------------------------------------------- */

/**
 * Call the `accept_invitation` RPC (DEL-81). Same shape as
 * `acceptInvitationWithPc` minus the PC argument — used by the
 * notifications-modal accept flow where the user joins as an active
 * `player` with no agent attached. Agent assignment happens later via
 * the Agent Panel ASSIGN flow.
 */
export async function acceptInvitation(
  invitationId: string,
): Promise<Result<AcceptInvitationResult>> {
  const { data, error } = await supabase.rpc('accept_invitation', {
    p_invitation_id: invitationId,
  });

  if (error) return mapPostgrestError(error);

  const rows = (data ?? []) as RawAcceptRow[];
  if (rows.length === 0) {
    return unknown(new Error('accept_invitation returned no rows'));
  }

  const row = rows[0];
  if (!ACCEPT_STATUSES.has(row.status as AcceptInvitationResult['status'])) {
    return unknown(new Error(`Unexpected accept status: ${row.status}`));
  }

  if (row.status === 'accepted') {
    if (!row.campaign_id) {
      return unknown(new Error('Accepted invitation returned null campaign_id'));
    }
    return ok({ status: 'accepted', campaign_id: row.campaign_id });
  }

  return ok({
    status: row.status as 'gone' | 'deleted' | 'full',
    campaign_id: null,
  });
}

/* -------------------------------------------------------------------------- */
/*  Decline (in-app)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Decline an existing-user invitation. Direct UPDATE rather than an RPC:
 * the invitee-update RLS policy on `campaign_invitations` (DEL-34)
 * covers `invitee_user_id = auth.uid()`, which is the exact path the
 * in-app accept screen hits. Returns the post-update row count for
 * idempotency — zero matched rows means the invitation was no longer
 * pending (race with revoke / accept / expiry), and the page falls
 * back to a `getInvitationForAccept` refetch to pick the right
 * `InviteGoneScreen` variant.
 */
export async function declineInvitation(
  invitationId: string,
): Promise<Result<{ matched: number }>> {
  const { data, error } = await supabase
    .from('campaign_invitations')
    .update({ status: 'declined', resolved_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('status', 'pending')
    .select('id');

  if (error) return mapPostgrestError(error);
  return ok({ matched: (data ?? []).length });
}

/* -------------------------------------------------------------------------- */
/*  Email dispatch                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Distinct error variants returned by the `send-invitation-email` edge
 * function. Two of these surface a specific UX:
 *
 *   - `not_configured` — a required server-side env var is unset on the
 *     Supabase project: either the Resend credentials
 *     (`email_provider_not_configured`) or `APP_BASE_URL`
 *     (`app_base_url_not_configured`). Either way the invitation row
 *     exists; the Handler can share the magic-link URL manually. Dev-time
 *     signal.
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
    if (
      raw?.error === 'email_provider_not_configured' ||
      raw?.error === 'app_base_url_not_configured'
    ) {
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
