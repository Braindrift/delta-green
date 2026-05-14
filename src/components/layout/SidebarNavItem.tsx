/**
 * A single sidebar nav item — `NavLink` that highlights when its route is
 * active. Renders the bullet icon, label, and a count badge.
 *
 * The active styling is applied via `NavLink`'s render-prop API rather
 * than `className=({ isActive }) => ...` string concat, to keep the long
 * Tailwind chain readable.
 */

import { NavLink } from 'react-router-dom';

export type SidebarNavItemProps = {
  to: string;
  label: string;
  /**
   * Display value for the count badge. `null` renders as a dash placeholder
   * (used when there's no campaign in context yet).
   */
  count: number | null;
  /**
   * Should the route match exactly (no descendants), e.g. for `/operations`
   * vs `/operations/active`. Defaults to `true` because every nav leaf
   * targets a leaf route.
   */
  end?: boolean;
};

export function SidebarNavItem({ to, label, count, end = true }: SidebarNavItemProps) {
  return (
    <NavLink to={to} end={end} className="dg-nav-item">
      {({ isActive }) => (
        <>
          <span className={`dg-nav-item-icon font-ui text-[10px] w-[14px] text-center flex-shrink-0 transition-colors ${isActive ? 'text-green-accent' : 'text-green-dim'}`}>
            {isActive ? '▸' : '◦'}
          </span>
          <span className={`font-ui text-[11px] tracking-[0.06em] flex-1 transition-colors ${isActive ? 'text-paper' : 'text-paper-dark'}`}>
            {label}
          </span>
          <span
            className={`font-ui text-[9px] min-w-[22px] text-center px-[5px] py-px border transition-colors ${
              isActive
                ? 'text-green-bright border-green-dim bg-green-accent/10'
                : 'text-green-bright border-green-accent/25 bg-green-accent/5'
            }`}
          >
            {count === null ? '—' : count}
          </span>
        </>
      )}
    </NavLink>
  );
}
