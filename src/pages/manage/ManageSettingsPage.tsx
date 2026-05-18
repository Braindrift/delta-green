/**
 * Campaign Settings screen (DEL-48).
 *
 * Lives at `/campaigns/:campaignId/manage/settings`, gated by `ManageGuard`
 * so only the active Handler can land here. v1 surface: a single "Danger
 * zone" section housing the soft-delete affordance.
 *
 * Rename (M-7a) and transfer-ownership (M-7c / DEL-49) will land as sibling
 * sections in this file. The page is structured as a vertical stack of
 * sections so adding those is additive — no restructure required.
 *
 * On a successful delete:
 *   1. The DEL-35 trigger has already enqueued `campaign_deleted`
 *      notifications for every other member in the same transaction.
 *   2. RLS has already hidden the campaign from every read — including the
 *      Handler's own. Any follow-up campaign-scoped fetch will now miss.
 *   3. We toast and `navigate('/')` so the Handler doesn't land on a guard
 *      page rendering a redirect on top of a stale campaign context.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteCampaignModal } from '@/components/manage/DeleteCampaignModal';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';

type DialogState = { kind: 'closed' } | { kind: 'delete' };

export function ManageSettingsPage() {
  const { campaign } = useCurrentCampaign();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });

  // CampaignGuard guarantees a non-null campaign before this mounts, but
  // keep the access optional so a future refactor that moves the mount
  // point still type-checks.
  const campaignId = campaign?.id;
  const campaignName = campaign?.name ?? '';

  return (
    <section>
      <header className="mb-7">
        <h1 className="font-display text-[26px] font-light tracking-[0.18em] uppercase text-paper">
          Settings
        </h1>
        <p className="font-ui text-[11px] tracking-[0.14em] text-green-mid mt-1 uppercase">
          Campaign-level controls
        </p>
      </header>

      <DangerZone
        disabled={!campaignId}
        onDeleteRequest={() => setDialog({ kind: 'delete' })}
      />

      {dialog.kind === 'delete' && campaignId ? (
        <DeleteCampaignModal
          campaignId={campaignId}
          campaignName={campaignName}
          onClose={() => setDialog({ kind: 'closed' })}
          onDeleted={() => {
            setDialog({ kind: 'closed' });
            showToast('success', `${campaignName} deleted.`);
            navigate('/', { replace: true });
          }}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Danger zone                                                               */
/* -------------------------------------------------------------------------- */

function DangerZone({
  disabled,
  onDeleteRequest,
}: {
  disabled: boolean;
  onDeleteRequest: () => void;
}) {
  return (
    <section>
      <h2 className="font-display text-[13px] font-light tracking-[0.22em] uppercase text-red-stamp mb-3">
        Danger zone
      </h2>
      <div className="border border-red-faded/60 bg-red-faded/[0.04] px-5 py-4 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-ui text-[12px] tracking-[0.06em] text-paper mb-1">
            Delete this campaign
          </div>
          <p className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed max-w-xl">
            All active members are notified and immediately lose access.
            Operations, sessions, and entity records remain on file but are no
            longer reachable from the app.
          </p>
        </div>
        <button
          type="button"
          onClick={onDeleteRequest}
          disabled={disabled}
          className={[
            'font-ui text-[11px] tracking-[0.22em] uppercase px-4 py-[9px]',
            'text-red-stamp border border-red-faded bg-red-faded/[0.08]',
            'cursor-pointer transition-all duration-150',
            'hover:bg-red-faded/[0.16] hover:shadow-[0_0_12px_rgba(170,80,80,0.18)]',
            'focus:outline-none focus:border-red-stamp',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
            'flex-shrink-0',
          ].join(' ')}
        >
          Delete campaign
        </button>
      </div>
    </section>
  );
}
