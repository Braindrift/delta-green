/**
 * A collapsible group of nav items in the sidebar. Renders a clickable
 * header (label + toggle chevron) and an animated container holding the
 * group's children.
 *
 * Collapse state is owned by the parent `Sidebar` (so it can persist via
 * `useSidebarCollapse`) — this component only fires `onToggle`.
 */

import type { ReactNode } from 'react';

export type SidebarNavGroupProps = {
  label: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function SidebarNavGroup({ label, isCollapsed, onToggle, children }: SidebarNavGroupProps) {
  return (
    <div className={`flex-shrink-0 ${isCollapsed ? 'dg-nav-group-collapsed' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 pt-3 pb-[5px] px-4 cursor-pointer select-none group bg-transparent border-0"
      >
        <span className="font-display text-[8px] font-normal tracking-[0.35em] text-green-bright uppercase flex-1 text-left transition-colors group-hover:text-green-accent">
          {label}
        </span>
        <span
          className={`font-ui text-[8px] text-green-mid leading-none transition-transform duration-200 ${
            isCollapsed ? '-rotate-90' : ''
          }`}
        >
          ▾
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-[250ms] ease ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[300px] opacity-100'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
