/**
 * Campaign Info Panel — stub (DEL-69).
 *
 * Read-only summary of a campaign, rendered in the left column of the
 * landing page via the panel-swap mechanism introduced in DEL-69. The
 * caller (`CampaignsLandingPage`) hands over campaign identity and the
 * already-loaded member-count / max-agents so the header can paint
 * without a second fetch.
 *
 * This file is intentionally a stub. The real contents — member list,
 * GM row, pending invitations, Open-into-campaign button, RLS work for
 * non-Handler readers — are DEL-70's scope. DEL-69 only ships the
 * wiring (Info button + panel swap), so this component exists to give
 * that swap something concrete to render and to lock in the props
 * contract DEL-70 will consume.
 */

import { Link } from 'react-router-dom';

export type CampaignInfoPanelProps = {
  campaignId: string;
  campaignName: string;
  memberCount: number;
  maxAgents: number;
  onClose: () => void;
};

export function CampaignInfoPanel({
  campaignId,
  campaignName,
  memberCount,
  maxAgents,
  onClose,
}: CampaignInfoPanelProps) {
  return (
    <section>
      <header className="mb-7 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper truncate">
            {campaignName}
          </h1>
          <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
            {memberCount} / {maxAgents} players
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-paper-worn border border-green-dim/60 bg-transparent',
            'transition-all duration-150',
            'hover:text-paper hover:border-green-mid',
          ].join(' ')}
        >
          Close
        </button>
      </header>

      <div className="border border-dashed border-green-dim bg-desk-edge px-6 py-8 text-center flex flex-col items-center gap-3">
        <div className="font-display text-[14px] tracking-[0.18em] uppercase text-paper-worn">
          Campaign info
        </div>
        <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/70 max-w-sm">
          Member roster and details land in DEL-70.
        </p>
        <Link
          to={`/campaigns/${campaignId}/operations`}
          className={[
            'mt-2 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
          ].join(' ')}
        >
          Open campaign
        </Link>
      </div>
    </section>
  );
}
