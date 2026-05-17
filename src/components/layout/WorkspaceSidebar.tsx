import { NavLink } from 'react-router-dom';

type WorkspaceNavItem = {
  to: string;
  label: string;
  badge?: number | null;
};

const WORKSPACE_NAV: WorkspaceNavItem[] = [
  { to: '/', label: 'CAMPAIGNS' },
  { to: '/agents', label: 'AGENTS' },
  { to: '/notifications', label: 'NOTIFICATIONS', badge: 0 },
  { to: '/browse', label: 'BROWSE' },
];

export function WorkspaceSidebar() {
  return (
    <nav className="dg-sidebar w-[280px] flex-shrink-0 flex flex-col overflow-hidden relative border-r border-green-dim">
      <div className="dg-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden py-3">
        {WORKSPACE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center justify-between px-5 py-[10px]',
                'font-ui text-[11px] tracking-[0.12em] uppercase transition-colors',
                isActive
                  ? 'text-green-accent bg-green-accent/[0.07]'
                  : 'text-paper-worn hover:text-paper hover:bg-white/[0.03]',
              ].join(' ')
            }
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
