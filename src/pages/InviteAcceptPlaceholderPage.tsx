/**
 * Placeholder for the in-app accept screen (`/invitations/:id`). The real
 * implementation — PC picker, atomic accept transaction, four campaign-
 * state variants of the `InviteGoneScreen` — ships in DEL-46.
 *
 * Today this route is reached from two paths set up by DEL-45:
 *
 *   - `InviteTokenPage` redirects here after `claim_invitation_by_token`
 *     succeeds (magic-link recipient signed in with matching email).
 *   - The notifications inbox (when it lands) will deep-link here.
 *
 * The body sits inside the workspace chrome — `ManageLayout`-style — so
 * the recipient still has the sidebar. Until DEL-46 lands they need a way
 * to bail back to the workspace landing, so we render a "Back to
 * campaigns" CTA.
 */

import { useNavigate, useParams } from 'react-router-dom';

export function InviteAcceptPlaceholderPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Invitation linked
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Accept screen — DEL-46
        </p>
      </header>

      <div className="border border-green-dim bg-desk-edge px-5 py-4 max-w-2xl">
        <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
          Pending feature
        </div>
        <p className="font-ui text-[12px] mt-2 text-paper-worn tracking-[0.04em] leading-relaxed">
          Your invitation is linked to this account. The accept flow — pick a
          Player Character, confirm joining, route into the campaign — lands
          in DEL-46. For now, you can return to the workspace landing.
        </p>
        {invitationId ? (
          <p className="font-ui text-[10px] mt-3 tracking-[0.12em] text-green-mid uppercase">
            Reference · {invitationId}
          </p>
        ) : null}
        <div className="mt-4">
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
      </div>
    </section>
  );
}
