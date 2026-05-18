/**
 * Terminal state of an invite-token or in-app accept-screen landing —
 * the link points at a row that's no longer actionable. Six variants:
 *
 *   - `revoked`   — Handler cancelled the invite.
 *   - `expired`   — invitation passed its `expires_at`.
 *   - `accepted`  — already accepted (single-use token).
 *   - `declined`  — already declined.
 *   - `deleted`   — the campaign itself was soft-deleted (DEL-46).
 *   - `full`      — the campaign reached `max_agents` before this
 *                   invitation could be accepted (DEL-46).
 *
 * The first four are about the invitation row's status; the last two
 * are about the campaign state at accept time. The in-app accept
 * screen receives the campaign-state variants from the
 * `accept_invitation_with_pc` RPC's discriminator.
 *
 * All variants share the same chrome and CTA ("Back to campaigns"). Copy
 * differs so the recipient understands why the link is dead — silent
 * "invitation unavailable" would leave them wondering.
 */

import { useNavigate } from 'react-router-dom';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthShell } from '@/components/auth/AuthShell';

export type InviteGoneVariant =
  | 'revoked'
  | 'expired'
  | 'accepted'
  | 'declined'
  | 'deleted'
  | 'full';

export type InviteGoneScreenProps = {
  variant: InviteGoneVariant;
  /** Optional campaign name for warmer copy. */
  campaignName?: string | null;
};

export function InviteGoneScreen({ variant, campaignName }: InviteGoneScreenProps) {
  const navigate = useNavigate();
  const { alertTitle, body } = COPY[variant];

  return (
    <AuthShell title="Invitation unavailable" subtitle="This link is no longer active">
      <AuthAlert variant="error" title={alertTitle}>
        {body(campaignName)}
      </AuthAlert>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
          ].join(' ')}
        >
          Back to campaigns
        </button>
      </div>
    </AuthShell>
  );
}

const COPY: Record<
  InviteGoneVariant,
  { alertTitle: string; body: (campaignName?: string | null) => string }
> = {
  revoked: {
    alertTitle: 'Invitation revoked',
    body: (name) =>
      name
        ? `The Handler revoked this invitation to "${name}" before it could be accepted.`
        : 'The Handler revoked this invitation before it could be accepted.',
  },
  expired: {
    alertTitle: 'Invitation expired',
    body: (name) =>
      name
        ? `This invitation to "${name}" has expired. Ask the Handler to send a fresh one.`
        : 'This invitation has expired. Ask the Handler to send a fresh one.',
  },
  accepted: {
    alertTitle: 'Already accepted',
    body: (name) =>
      name
        ? `This invitation to "${name}" has already been accepted.`
        : 'This invitation has already been accepted.',
  },
  declined: {
    alertTitle: 'Already declined',
    body: (name) =>
      name
        ? `This invitation to "${name}" has already been declined.`
        : 'This invitation has already been declined.',
  },
  deleted: {
    alertTitle: 'Campaign closed',
    body: (name) =>
      name
        ? `The campaign "${name}" no longer exists. Ask the Handler if a new operation is being assembled.`
        : 'This campaign no longer exists. Ask the Handler if a new operation is being assembled.',
  },
  full: {
    alertTitle: 'Roster full',
    body: (name) =>
      name
        ? `The roster for "${name}" is full. Ask the Handler if a seat opens up.`
        : 'The roster is full. Ask the Handler if a seat opens up.',
  },
};
