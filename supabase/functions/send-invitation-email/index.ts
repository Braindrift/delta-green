// DEL-45 — Send a stranger-invitation magic-link email.
//
// Invoked by the client immediately after a stranger-invite row is inserted
// (see `src/lib/invitations/mutations.ts`). The function takes the
// invitation_id, looks the row up server-side (so the caller can't forge
// payload fields), authenticates the caller as the Handler of the campaign,
// and dispatches a minimal magic-link email via Resend.
//
// Env vars (set on the Supabase project):
//
//   RESEND_API_KEY     — Resend API key. Required. When unset, the function
//                        returns 503 so the client surfaces a "delivery not
//                        configured" message; the invitation row still
//                        exists, and the Handler can copy the magic-link URL
//                        from the invitations list as a workaround.
//   RESEND_FROM_EMAIL  — Verified sender, e.g. "Delta Green
//                        <noreply@your-domain>". Required when
//                        RESEND_API_KEY is set.
//   APP_BASE_URL       — Public origin of the web app (no trailing slash),
//                        used to build the `/invite/:token` link. Falls back
//                        to the request's `Origin` header so the function
//                        still works in preview deployments without a
//                        dedicated env var.
//
// Authentication: this function requires a valid JWT (Supabase verifies it
// before invocation). The function then:
//
//   - Loads the invitation by id using the *caller's* session (so RLS's
//     "gm can read" policy gates the lookup — only the campaign's Handler
//     can see the row, and therefore only the Handler can send the email).
//   - Validates that the invitation is still pending, has a token, and has
//     an `invitee_email`.
//   - Calls Resend's HTTP API with a minimal HTML + text body.
//
// The email template is deliberately minimal (DoD says polished content is
// a separate ticket). Campaign name + inviter handle + CTA link is the
// contract; structure / branding can be iterated on later.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';

type SendRequest = {
  invitation_id?: string;
};

type InvitationRow = {
  id: string;
  campaign_id: string;
  invited_by: string;
  invitee_email: string | null;
  token: string | null;
  status: string;
  expires_at: string;
};

type ResendResponse = {
  id?: string;
  message?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: SendRequest;
  try {
    body = (await req.json()) as SendRequest;
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const invitationId = body.invitation_id;
  if (!invitationId || typeof invitationId !== 'string') {
    return json({ error: 'missing_invitation_id' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500);
  }

  // RLS-bound client — uses the caller's JWT, so the invitation lookup is
  // gated by the campaign_invitations select policies (gm-can-read).
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: invitation, error: lookupError } = await supabase
    .from('campaign_invitations')
    .select('id, campaign_id, invited_by, invitee_email, token, status, expires_at')
    .eq('id', invitationId)
    .single<InvitationRow>();

  if (lookupError || !invitation) {
    return json({ error: 'invitation_not_found' }, 404);
  }

  if (invitation.status !== 'pending') {
    return json({ error: 'invitation_not_pending' }, 409);
  }

  if (!invitation.invitee_email || !invitation.token) {
    // Existing-user invites have no email / no token — they don't ride this
    // path. Bail rather than silently no-op so the client surfaces the bug.
    return json({ error: 'not_a_stranger_invite' }, 400);
  }

  // Look up the campaign name + inviter handle for the email body. Both
  // reads ride RLS — the Handler can read their own campaign, and
  // `user_profiles` is publicly readable. Failures are non-fatal; we fall
  // back to safe defaults so a delivery never silently breaks on a
  // missing display field.
  const [campaignResult, inviterResult] = await Promise.all([
    supabase
      .from('campaigns')
      .select('name')
      .eq('id', invitation.campaign_id)
      .single<{ name: string }>(),
    supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', invitation.invited_by)
      .single<{ username: string }>(),
  ]);

  const campaignName = campaignResult.data?.name ?? 'a Delta Green campaign';
  const inviterHandle = inviterResult.data?.username ?? 'A Handler';

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL');
  if (!resendApiKey || !resendFrom) {
    return json(
      { error: 'email_provider_not_configured' },
      503,
    );
  }

  const baseUrl =
    Deno.env.get('APP_BASE_URL') ??
    req.headers.get('Origin') ??
    'https://delta-green-fawn.vercel.app';
  const inviteUrl = `${baseUrl.replace(/\/$/, '')}/invite/${encodeURIComponent(invitation.token)}`;

  const subject = `${inviterHandle} invited you to ${campaignName}`;
  const text = renderTextBody({ inviterHandle, campaignName, inviteUrl });
  const html = renderHtmlBody({ inviterHandle, campaignName, inviteUrl });

  const dispatch = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [invitation.invitee_email],
      subject,
      text,
      html,
    }),
  });

  if (!dispatch.ok) {
    let detail: ResendResponse | null = null;
    try {
      detail = (await dispatch.json()) as ResendResponse;
    } catch {
      // ignore — fall through with no detail
    }
    return json(
      {
        error: 'email_provider_failed',
        provider_status: dispatch.status,
        provider_message: detail?.message ?? null,
      },
      502,
    );
  }

  return json({ ok: true }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderTextBody(args: {
  inviterHandle: string;
  campaignName: string;
  inviteUrl: string;
}): string {
  return [
    `${args.inviterHandle} has invited you to join the Delta Green campaign "${args.campaignName}".`,
    '',
    `Open this link to respond:`,
    args.inviteUrl,
    '',
    'If you do not have an account yet, the link will walk you through signup.',
    'If you were not expecting this, you can safely ignore the message.',
  ].join('\n');
}

function renderHtmlBody(args: {
  inviterHandle: string;
  campaignName: string;
  inviteUrl: string;
}): string {
  const safeInviter = escapeHtml(args.inviterHandle);
  const safeCampaign = escapeHtml(args.campaignName);
  const safeUrl = escapeHtml(args.inviteUrl);
  return [
    '<!doctype html>',
    '<html><body style="font-family: -apple-system, system-ui, sans-serif; color: #1f2418; max-width: 540px; margin: 0 auto; padding: 24px;">',
    `<p>${safeInviter} has invited you to join the Delta Green campaign <strong>${safeCampaign}</strong>.</p>`,
    `<p><a href="${safeUrl}" style="display: inline-block; padding: 10px 18px; background: #2c3a26; color: #e6e4d6; text-decoration: none; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px;">Open invitation</a></p>`,
    `<p style="color: #555; font-size: 12px;">Or copy this link into your browser:<br><span style="word-break: break-all;">${safeUrl}</span></p>`,
    '<hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">',
    '<p style="color: #888; font-size: 11px;">If you were not expecting this, you can safely ignore the message.</p>',
    '</body></html>',
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
