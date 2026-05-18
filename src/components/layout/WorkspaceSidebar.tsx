import { NavLink, useLocation } from 'react-router-dom';

type WorkspaceNavItem = {
  to: string;
  label: string;
  badge?: number | null;
  /**
   * Optional override for the "active" predicate. When omitted, the NavLink's
   * own `isActive` (exact match) is used. The Campaigns item uses this to stay
   * highlighted across the campaign-management subtree (`/campaigns/:id/manage/...`),
   * because management is a workspace-layer concern even when the URL sits
   * under `/campaigns/`.
   */
  matchPathname?: (pathname: string) => boolean;
};

const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    to: '/',
    label: 'CAMPAIGNS',
    // Active on `/` itself plus any `/campaigns/...` route — the
    // workspace-layer campaign management screens (DEL-43) live there too.
    // The campaign shell uses AppLayout (no WorkspaceSidebar), so this
    // predicate only fires on the workspace-rendered subset.
    matchPathname: (pathname) =>
      pathname === '/' || pathname === '/campaigns' || pathname.startsWith('/campaigns/'),
  },
  { to: '/agents', label: 'AGENTS' },
  { to: '/notifications', label: 'NOTIFICATIONS', badge: 0 },
  { to: '/browse', label: 'BROWSE' },
];

export function WorkspaceSidebar() {
  const location = useLocation();

  return (
    <nav className="dg-sidebar w-[280px] flex-shrink-0 flex flex-col overflow-hidden relative border-r border-green-dim">
      <div className="dg-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden py-3">
        {WORKSPACE_NAV.map((item) => {
          const matched = item.matchPathname?.(location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' && item.matchPathname === undefined}
              className={({ isActive }) => {
                const active = matched ?? isActive;
                return [
                  'flex items-center justify-between px-5 py-[10px]',
                  'font-ui text-[11px] tracking-[0.12em] uppercase transition-colors',
                  active
                    ? 'text-green-accent bg-green-accent/[0.07]'
                    : 'text-paper-worn hover:text-paper hover:bg-white/[0.03]',
                ].join(' ');
              }}
            >
              <span>{item.label}</span>
              {item.badge != null && (
                <span
                  className={[
                    'font-ui text-[9px] tracking-[0.1em] px-[7px] py-[2px] rounded-full',
                    item.badge > 0
                      ? 'bg-green-accent text-desk'
                      : 'bg-green-dim/30 text-green-mid',
                  ].join(' ')}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
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
