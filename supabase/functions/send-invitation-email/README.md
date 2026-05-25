# `send-invitation-email`

Edge function that sends a magic-link email for a stranger campaign
invitation (DEL-45).

Invoked from the client (`src/lib/invitations/mutations.ts` →
`sendInvitationEmail`) after a row is inserted into `campaign_invitations`
with `invitee_email` set. The function looks the row up under the caller's
JWT (so RLS gates access to the Handler of the campaign), then dispatches a
minimal email via Resend.

## Required env vars

Set these on the Supabase project (Dashboard → Project Settings → Edge
Functions → Secrets):

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Delta Green <noreply@your-domain>`. |
| `APP_BASE_URL` | Public origin of the web app (no trailing slash), used to build the `/invite/:token` link. The request's `Origin` header is accepted as a fallback, but when both are missing the function returns 503 rather than mailing a link to a hardcoded host. |

When `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are unset the function returns
`503 email_provider_not_configured`; when neither `APP_BASE_URL` nor an
`Origin` header is available it returns `503 app_base_url_not_configured`.
Both surface the client's "delivery not configured" message. The invitation
row still exists and the Handler can manually share the magic-link URL —
useful for dev environments where the function is not yet provisioned.

## Deploying

The repo's MCP tooling deploys this function automatically via
`mcp__claude_ai_Supabase__deploy_edge_function` during the DEL-45 ticket.
For manual redeploys:

```bash
npx supabase functions deploy send-invitation-email
```

## Email template

Deliberately minimal per DoD ("placeholder copy mentioning campaign name +
inviter + CTA link"). Iterating on the template is a separate content
ticket; the structure here is the load-bearing contract.
