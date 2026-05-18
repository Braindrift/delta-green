/**
 * Workspace landing page — campaign list.
 *
 * Left column: the caller's active campaign memberships, grouped by role
 * ("As Handler" first, "As Agent" second). Each row is an "Open" affordance
 * routing to `/campaigns/:id/operations`. The empty state mirrors the
 * wireframe (dashed-border card, "Create campaign" CTA).
 *
 * Right column: a placeholder for the Agent Panel (DEL-51). PC-1 owns the
 * eventual implementation; this page just reserves the column so the
 * layout doesn't reflow when DEL-51 lands.
 *
 * Data:
 *   - `listMyMemberships()` returns membership rows joined with campaign
 *     rows and a pre-merged member count. The query is RLS-narrowed to
 *     `auth.uid()` rows already; the explicit `status = 'active'` filter
 *     and `campaign.deleted_at is null` join condition guard against
 *     soft-deleted campaigns and former memberships leaking through.
 *   - States exposed: loading → error → empty → populated. Loading shows
 *     a stamped placeholder so the chrome doesn't visibly reflow.
 *
 * Stubs:
 *   - `+ New campaign` routes to `/campaigns/new` (M-2 / DEL-?). The route
 *     does not exist yet; the catch-all in `App.tsx` will bounce back to
 *     `/` until M-2 lands.
 *   - `Browse` is rendered as a disabled button with a `coming soon` tooltip
 *     per the issue's implementation notes. Real public browse lives in
 *     DEF-1 / DEL-?.
 */

import { Link } from 'react-router-dom';

import { useEffect, useState } from 'react';

import { listMyMemberships } from '@/lib/campaigns';
import type { CampaignMembership } from '@/types/campaigns';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; memberships: CampaignMembership[] };

export function CampaignsLandingPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void listMyMemberships().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ready', memberships: result.data });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handlerMemberships =
    state.kind === 'ready' ? state.memberships.filter((m) => m.role === 'gm') : [];
  const agentMemberships =
    state.kind === 'ready' ? state.memberships.filter((m) => m.role === 'player') : [];
  const hasNoCampaigns =
    state.kind === 'ready' && handlerMemberships.length === 0 && agentMemberships.length === 0;

  return (
    <div className="flex gap-8 items-start">
      <section className="flex-1 min-w-0">
        <PageHeader />

        {state.kind === 'loading' ? <LoadingCard /> : null}
        {state.kind === 'error' ? <ErrorCard /> : null}
        {hasNoCampaigns ? <EmptyCampaignsCard /> : null}

        {state.kind === 'ready' && !hasNoCampaigns ? (
          <div className="flex flex-col gap-8">
            {handlerMemberships.length > 0 ? (
              <MembershipsSection
                title="As Handler"
                count={handlerMemberships.length}
                memberships={handlerMemberships}
              />
            ) : null}
            {agentMemberships.length > 0 ? (
              <MembershipsSection
                title="As Agent"
                count={agentMemberships.length}
                memberships={agentMemberships}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <AgentPanelPlaceholder />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page header                                                               */
/* -------------------------------------------------------------------------- */

function PageHeader() {
  return (
    <header className="mb-7 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Campaigns
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Your handler groups and active operations
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Coming soon"
          className={[
            'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[7px]',
            'text-green-mid border border-green-dim/60 bg-transparent',
            'cursor-not-allowed opacity-60',
          ].join(' ')}
        >
          Browse
        </button>
        <Link
          to="/campaigns/new"
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px]',
            'text-green-accent border border-green-mid bg-green-accent/[0.06]',
            'transition-all duration-150',
            'hover:bg-green-accent/[0.12] hover:border-green-bright',
            'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
          ].join(' ')}
        >
          + New campaign
        </Link>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Memberships section                                                       */
/* -------------------------------------------------------------------------- */

type MembershipsSectionProps = {
  title: string;
  count: number;
  memberships: CampaignMembership[];
};

function MembershipsSection({ title, count, memberships }: MembershipsSectionProps) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-paper-worn mb-3">
        {title} <span className="text-green-mid">· {count}</span>
      </h2>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {memberships.map((m) => (
          <CampaignCard key={m.campaign.id} membership={m} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Campaign card                                                             */
/* -------------------------------------------------------------------------- */

function CampaignCard({ membership }: { membership: CampaignMembership }) {
  const { campaign, member_count, role } = membership;
  const roleLabel = role === 'gm' ? 'Handler' : 'Agent';
  const memberLabel = `${member_count} ${member_count === 1 ? 'member' : 'members'}`;

  return (
    <div className="border border-green-dim bg-desk-edge p-4 flex flex-col gap-3 min-h-[140px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[15px] tracking-[0.12em] uppercase text-paper truncate">
            {campaign.name}
          </div>
          {campaign.codename ? (
            <div className="font-stamp text-[10px] tracking-[0.18em] uppercase text-amber-dim mt-[2px] truncate">
              {campaign.codename}
            </div>
          ) : null}
        </div>
        <span className="font-ui text-[9px] tracking-[0.16em] uppercase text-green-mid border border-green-dim/60 px-[6px] py-[2px] flex-shrink-0">
          {roleLabel}
        </span>
      </div>

      <div className="font-ui text-[10px] tracking-[0.14em] uppercase text-paper-dark/80 mt-auto">
        {memberLabel}
      </div>

      <Link
        to={`/campaigns/${campaign.id}/operations`}
        className={[
          'font-ui text-[11px] tracking-[0.22em] uppercase px-3 py-[7px] text-center',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Open
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Loading / error / empty                                                   */
/* -------------------------------------------------------------------------- */

function LoadingCard() {
  return (
    <div className="border border-green-dim/60 bg-paper-dark/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-amber-dim text-sm uppercase tracking-widest">
        Loading dossier…
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/70 tracking-[0.1em] uppercase">
        Decrypting active memberships
      </div>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="border border-red-faded bg-red-faded/10 px-5 py-4 max-w-xl">
      <div className="font-stamp text-red-stamp text-sm uppercase tracking-widest">
        Transmission failed
      </div>
      <div className="font-ui text-[11px] mt-2 text-paper-dark/80 tracking-[0.1em] uppercase">
        Could not load campaigns. Reload the page to retry.
      </div>
    </div>
  );
}

function EmptyCampaignsCard() {
  return (
    <div className="border border-dashed border-green-dim bg-desk-edge px-8 py-10 max-w-xl text-center flex flex-col items-center gap-3">
      <div className="font-display text-[18px] tracking-[0.18em] uppercase text-paper">
        No campaigns yet
      </div>
      <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-paper-dark/80 max-w-sm">
        Start one as a Handler, or wait for an invite.
      </p>
      <Link
        to="/campaigns/new"
        className={[
          'mt-2 font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
          'text-green-accent border border-green-mid bg-green-accent/[0.06]',
          'transition-all duration-150',
          'hover:bg-green-accent/[0.12] hover:border-green-bright',
          'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        ].join(' ')}
      >
        Create campaign
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Right column — Agent Panel placeholder                                    */
/* -------------------------------------------------------------------------- */

function AgentPanelPlaceholder() {
  return (
    <aside className="w-[340px] flex-shrink-0 border border-green-dim/60 bg-desk-edge p-5">
      <div className="font-display text-[12px] font-light tracking-[0.22em] uppercase text-paper-worn mb-2">
        Agent Panel
      </div>
      <div className="font-stamp text-amber text-sm uppercase tracking-widest">
        Section view — not yet implemented
      </div>
      <div className="font-ui text-[11px] mt-2 text-ink-faded/80 leading-relaxed">
        Will be implemented in <span className="text-amber-dim">DEL-51</span>. Minimum-viable
        player-character support (CRUD + accept-invite picker).
      </div>
    </aside>
  );
}
