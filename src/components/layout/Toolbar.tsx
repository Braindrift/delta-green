/**
 * The content toolbar — 46px strip at the top of the content pane.
 *
 * Layout (left → right): breadcrumb, then a right-aligned cluster with
 * EXPORT, IMPORT, "+ NEW RECORD", and the user menu.
 *
 * Per design doc §4.3:
 *
 *  - **Breadcrumb** reads from the current route — looked up in
 *    `NAV_ITEMS` to find the matching `breadcrumb` label. Falls back
 *    to the URL path when no match.
 *  - **Export / Import** are placeholder click handlers for now. The
 *    full JSON registry export/import flow is a separate concern (see
 *    design doc §14) and isn't blocked on DEL-14 but isn't part of it
 *    either.
 *  - **+ NEW RECORD** opens the registry-driven dropdown.
 *  - **User menu** replaces the prototype's lack of one.
 */

import { useLocation, useMatch } from 'react-router-dom';

import { NAV_ITEMS } from '@/components/layout/navConfig';
import { NewRecordMenu } from '@/components/layout/NewRecordMenu';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import type { RecordType } from '@/types/records';

export function Toolbar() {
  const location = useLocation();
  // Extract the segment after /campaigns/:campaignId/ for nav lookups.
  const match = useMatch('/campaigns/:campaignId/*');
  const segment = match?.params['*'] ?? location.pathname;
  const navItem = NAV_ITEMS.find((it) => it.path === segment);
  const breadcrumb = navItem?.breadcrumb ?? segment.toUpperCase();

  // campaign is guaranteed non-null by CampaignGuard at the AppLayout level.
  const { campaign } = useCurrentCampaign();
  const campaignLabel =
    (campaign?.codename ?? campaign?.name ?? 'CAMPAIGN').toUpperCase();

  function onNewRecord(type: RecordType): void {
    // Wiring to the form panel arrives with DEL-17. For now, just log so
    // we can verify the dropdown closed and the right type was picked.
    console.info('[DEL-14] + NEW RECORD selected:', type);
  }

  function onExport(): void {
    console.info('[DEL-14] EXPORT clicked — registry export not yet wired (design doc §14).');
  }

  function onImport(): void {
    console.info('[DEL-14] IMPORT clicked — registry import not yet wired (design doc §14).');
  }

  return (
    <div className="dg-toolbar h-[46px] border-b border-green-dim flex items-center px-7 gap-3 flex-shrink-0 relative z-[2]">
      <div className="font-ui text-[10px] text-green-bright tracking-[0.15em] uppercase">
        {campaignLabel}{' '}
        <span className="text-green-mid mx-[2px]">/</span>{' '}
        <span className="text-green-accent">{breadcrumb}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="dg-toolbar-btn font-ui text-[10px] tracking-[0.12em] uppercase px-[14px] py-[5px] cursor-pointer transition-all"
        >
          EXPORT
        </button>
        <button
          type="button"
          onClick={onImport}
          className="dg-toolbar-btn font-ui text-[10px] tracking-[0.12em] uppercase px-[14px] py-[5px] cursor-pointer transition-all"
        >
          IMPORT
        </button>
        <NewRecordMenu onSelect={onNewRecord} />
      </div>
    </div>
  );
}
