/**
 * The 280px-wide sidebar — search input, four collapsible nav groups,
 * "EYES ONLY" decorative footer.
 *
 * Per design doc §4.2:
 *
 *  - The search input filters the nav tree in real time. For DEL-14 we
 *    implement label-only filtering (group label + item label). Record-name
 *    filtering needs both counts-by-campaign and per-leaf record names,
 *    neither of which is wired before DEL-15; tracked as a follow-up.
 *  - Empty groups (no items remaining after filter) are hidden entirely
 *    rather than rendered as an empty header.
 *  - Clearing the search restores the previous collapsed state — that's
 *    automatic here because the filter doesn't mutate collapse state.
 */

import { useMemo, useState } from 'react';

import { campaignPath, NAV_GROUPS, NAV_ITEMS } from '@/components/layout/navConfig';
import { SidebarNavGroup } from '@/components/layout/SidebarNavGroup';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';
import { useCurrentCampaign } from '@/contexts/CampaignContext';
import { useRecordCounts } from '@/hooks/useRecordCounts';
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse';

export function Sidebar() {
  const [search, setSearch] = useState('');
  const { isCollapsed, toggle } = useSidebarCollapse();

  // campaign is guaranteed non-null by CampaignGuard at the AppLayout level.
  const { campaign } = useCurrentCampaign();
  const counts = useRecordCounts(campaign?.id ?? null, NAV_ITEMS);

  const trimmed = search.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (trimmed === '') return NAV_GROUPS;
    return NAV_GROUPS
      .map((group) => {
        const groupLabelMatches = group.label.toLowerCase().includes(trimmed);
        const matchingItems = groupLabelMatches
          ? group.items
          : group.items.filter((item) => item.label.toLowerCase().includes(trimmed));
        return { ...group, items: matchingItems };
      })
      .filter((group) => group.items.length > 0);
  }, [trimmed]);

  // During search, force-open any group that has matching items so the
  // user actually sees the results.
  const isSearching = trimmed !== '';
  const groupCollapsed = (groupId: string): boolean =>
    isSearching ? false : isCollapsed(groupId);

  return (
    <nav className="dg-sidebar w-[280px] flex-shrink-0 flex flex-col overflow-hidden relative border-r border-green-dim">
      {/* Search */}
      <div className="px-4 py-[14px] border-b border-green-dim flex-shrink-0">
        <div className="dg-search-wrap flex items-center gap-2 px-[10px] py-[7px] border border-green-dim transition-colors">
          <span className="text-green-dim font-ui text-[11px]">[?]</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH REGISTRY..."
            autoComplete="off"
            className="bg-transparent border-0 outline-none font-ui text-[11px] text-paper w-full tracking-[0.08em] placeholder:text-green-mid placeholder:tracking-[0.15em]"
          />
        </div>
      </div>

      {/* Nav */}
      <div className="dg-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden">
        {visibleGroups.map((group, idx) => (
          <div key={group.id}>
            {idx > 0 && (
              <div className="dg-sidebar-divider h-px mx-3 my-[6px] opacity-60" />
            )}
            <SidebarNavGroup
              label={group.label}
              isCollapsed={groupCollapsed(group.id)}
              onToggle={() => toggle(group.id)}
            >
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  to={campaign ? campaignPath(campaign.id, item.path) : '#'}
                  label={item.label}
                  count={counts[item.path] ?? null}
                />
              ))}
            </SidebarNavGroup>
          </div>
        ))}
      </div>

      {/* Footer — decorative */}
      <div className="mt-auto border-t border-green-dim px-4 py-[14px] bg-black/20">
        <div className="font-stamp text-[9px] tracking-[0.12em] leading-[1.9] text-green-dim opacity-70">
          DELTA GREEN PROGRAM
          <br />
          UNAUTHORIZED ACCESS
          <br />
          WILL BE PROSECUTED
          <br />
          ── EYES ONLY ──
        </div>
      </div>
    </nav>
  );
}
