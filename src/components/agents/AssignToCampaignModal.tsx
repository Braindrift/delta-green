/**
 * Assign-to-campaign dialog (DEL-67).
 *
 * Triggered by the `[ASSIGN]` button on unassigned roster rows. Lets the
 * owner attach a PC to one of the campaigns they actively play in, minus
 * campaigns where they already have a PC attached (one-PC-per-campaign
 * rule — the design says "decline a PC or detach one to free up a slot"
 * rather than supporting multiple).
 *
 * Eligibility is computed in the dialog itself: `listMyMemberships()`
 * gives every active membership, the parent passes in the set of
 * campaign IDs already occupied by one of the user's PCs (derived from
 * the already-loaded roster — no extra fetch). Filtering down to
 * `role === 'player'` and removing the occupied set gives the dropdown
 * source.
 *
 * Visual language mirrors `LeaveCampaignModal` / `DeleteCampaignModal`:
 * `ModalShell`, width 460, the same green-accent confirm button as
 * `AgentRosterPanel`'s primary row affordance.
 */

import { useEffect, useState } from 'react';

import { ModalShell } from '@/components/common/ModalShell';
import { listMyMemberships } from '@/lib/campaigns';
import { assignPlayerCharacterToCampaign } from '@/lib/player-characters';
import type { CampaignMembership } from '@/types/campaigns';
import type { PlayerCharacterWithCampaign } from '@/types/player-characters';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; eligible: CampaignMembership[] };

export type AssignToCampaignModalProps = {
  pc: PlayerCharacterWithCampaign;
  /**
   * Campaign IDs the owner already has a PC in. Computed in the parent
   * from the already-loaded roster, so the dialog doesn't repeat the
   * `listMyPlayerCharacters` fetch.
   */
  attachedCampaignIds: Set<string>;
  onClose: () => void;
  /**
   * Fired after the assign succeeds. Receives the campaign name for the
   * parent's success toast.
   */
  onAssigned: (campaignName: string) => void;
};

export function AssignToCampaignModal({
  pc,
  attachedCampaignIds,
  onClose,
  onAssigned,
}: AssignToCampaignModalProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listMyMemberships();
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ kind: 'error' });
        return;
      }
      // DEL-74: intentionally not using `useCurrentCampaignRole` here —
      // the modal filters the user's memberships across all campaigns to
      // find ones the agent can be assigned into. The hook is scoped to
      // the campaign in the current route, which this modal doesn't have.
      const eligible = result.data.filter(
        (m) => m.role === 'player' && !attachedCampaignIds.has(m.campaign.id),
      );
      setLoad({ kind: 'ready', eligible });
    })();
    return () => {
      cancelled = true;
    };
  }, [attachedCampaignIds]);

  async function handleConfirm() {
    if (submitting || load.kind !== 'ready' || !selectedId) return;
    const target = load.eligible.find((m) => m.campaign.id === selectedId);
    if (!target) return;

    setSubmitting(true);
    setError(null);
    const result = await assignPlayerCharacterToCampaign(pc.id, target.campaign.id);
    setSubmitting(false);

    if (!result.ok) {
      setError('Could not assign this agent. Try again.');
      return;
    }
    onAssigned(target.campaign.name);
  }

  const isEmpty = load.kind === 'ready' && load.eligible.length === 0;

  return (
    <ModalShell
      title="Assign agent"
      subtitle={`Attach ${pc.name} to a campaign`}
      onClose={onClose}
      preventClose={submitting}
      width={460}
    >
      {load.kind === 'loading' ? (
        <p className="font-ui text-[11px] tracking-[0.12em] uppercase text-green-mid mb-5">
          Loading campaigns…
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div
          role="alert"
          className="mb-5 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Transmission failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            Could not load your campaigns. Close and try again.
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
          No campaigns available. Either you're not in any campaigns as an
          Agent, or you already have an agent in each. Decline a PC or
          detach one to free up a slot.
        </p>
      ) : null}

      {load.kind === 'ready' && !isEmpty ? (
        <>
          <p className="font-ui text-[12px] tracking-[0.04em] text-paper-worn leading-relaxed mb-5">
            Attach <span className="text-paper">{pc.name}</span> to which
            campaign?
          </p>

          <label
            htmlFor="assign-campaign"
            className="block font-ui text-[10px] tracking-[0.18em] uppercase text-green-bright mb-2"
          >
            Campaign
          </label>
          <select
            id="assign-campaign"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={submitting}
            className={[
              'w-full font-body text-[13px] text-paper bg-desk-groove',
              'border border-green-dim px-3 py-[8px] tracking-[0.04em]',
              'focus:outline-none focus:border-green-mid focus:bg-green-void',
              'transition-colors duration-150 mb-5',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            <option value="">— Select campaign —</option>
            {load.eligible.map((m) => (
              <option key={m.campaign.id} value={m.campaign.id}>
                {m.campaign.name}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 border border-red-faded bg-red-faded/[0.08] px-3 py-2"
        >
          <div className="font-stamp text-[11px] tracking-[0.18em] uppercase text-red-stamp mb-1">
            Action failed
          </div>
          <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
            {error}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={cancelButtonClass}
        >
          {isEmpty || load.kind === 'error' ? 'Close' : 'Cancel'}
        </button>
        {load.kind === 'ready' && !isEmpty ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !selectedId}
            className={confirmButtonClass}
          >
            {submitting ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block w-[5px] h-[5px] rounded-full bg-green-accent dg-status-dot"
                />
                Assigning…
              </>
            ) : (
              'Assign'
            )}
          </button>
        ) : null}
      </div>
    </ModalShell>
  );
}

const cancelButtonClass = [
  'font-ui text-[11px] tracking-[0.18em] uppercase px-3 py-[9px]',
  'text-green-mid border border-green-dim/60 bg-transparent',
  'transition-colors duration-150',
  'hover:text-paper hover:border-green-mid',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ');

const confirmButtonClass = [
  'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
  'text-green-accent border border-green-mid bg-green-accent/[0.06]',
  'cursor-pointer transition-all duration-150',
  'hover:bg-green-accent/[0.12] hover:border-green-bright',
  'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
  'focus:outline-none focus:border-green-bright',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
  'flex items-center gap-2',
].join(' ');
