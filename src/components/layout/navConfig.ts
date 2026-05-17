/**
 * Single source of truth for the sidebar taxonomy and the route table.
 *
 * Two things look at this:
 *
 *  - The {@link Sidebar} component, to render the four groups and their nav
 *    items in canonical order.
 *  - `App.tsx`, to wire up the protected nested routes so each leaf has a
 *    matching `<Route>` (each leaf currently renders a placeholder page —
 *    real per-type list views land in DEL-19+).
 *
 * Keeping both readers bound to one config means the sidebar URLs and the
 * router paths can't drift. Adding a new nav leaf is a one-line edit here
 * plus the matching placeholder page.
 *
 * Per design doc §5: four groups (Operations, Subjects, Entities, Events),
 * twelve record types, plus two "All …" derived views that aggregate their
 * children rather than being separate record types.
 */

import type { OperationStatus, RecordType } from '@/types/records';

/**
 * Which record type (and optional status filter) feeds a nav leaf's count
 * badge. The two derived "All …" views aggregate over multiple types and
 * have no `type` of their own.
 */
export type NavItemCountSource =
  | { kind: 'derived-operations-all' }
  | { kind: 'derived-events-all' }
  | { kind: 'type'; type: RecordType }
  | { kind: 'type-status'; type: 'operation'; status: OperationStatus };

export type NavItem = {
  /** Relative URL segment under the campaign shell, e.g. `operations/active`. */
  path: string;
  /** Sidebar label, exactly as rendered. Case-sensitive. */
  label: string;
  /** Toolbar breadcrumb suffix (`REGISTRY / <breadcrumb>`). Uppercase. */
  breadcrumb: string;
  /** Drives the count badge in the sidebar. */
  countSource: NavItemCountSource;
};

export type NavGroup = {
  /** Stable key used as the localStorage suffix for the collapse state. */
  id: 'operations' | 'subjects' | 'entities' | 'events';
  /** Group header label, e.g. "Operations". */
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        path: 'operations',
        label: 'All Operations',
        breadcrumb: 'ALL OPERATIONS',
        countSource: { kind: 'derived-operations-all' },
      },
      {
        path: 'operations/active',
        label: 'Active',
        breadcrumb: 'ACTIVE OPERATIONS',
        countSource: { kind: 'type-status', type: 'operation', status: 'active' },
      },
      {
        path: 'operations/closed',
        label: 'Closed',
        breadcrumb: 'CLOSED OPERATIONS',
        countSource: { kind: 'type-status', type: 'operation', status: 'closed' },
      },
      {
        path: 'operations/compromised',
        label: 'Compromised',
        breadcrumb: 'COMPROMISED OPERATIONS',
        countSource: { kind: 'type-status', type: 'operation', status: 'compromised' },
      },
    ],
  },
  {
    id: 'subjects',
    label: 'Subjects',
    items: [
      {
        path: 'subjects/agents',
        label: 'Agents',
        breadcrumb: 'AGENTS',
        countSource: { kind: 'type', type: 'agent' },
      },
      {
        path: 'subjects/civilians',
        label: 'Civilians',
        breadcrumb: 'CIVILIANS',
        countSource: { kind: 'type', type: 'civilian' },
      },
      {
        path: 'subjects/poi',
        label: 'Persons of Interest',
        breadcrumb: 'PERSONS OF INTEREST',
        countSource: { kind: 'type', type: 'poi' },
      },
      {
        path: 'subjects/unnatural',
        label: 'Unnatural',
        breadcrumb: 'UNNATURAL',
        countSource: { kind: 'type', type: 'unnatural' },
      },
    ],
  },
  {
    id: 'entities',
    label: 'Entities',
    items: [
      {
        path: 'entities/organisations',
        label: 'Organisations',
        breadcrumb: 'ORGANISATIONS',
        countSource: { kind: 'type', type: 'organisation' },
      },
      {
        path: 'entities/locations',
        label: 'Locations',
        breadcrumb: 'LOCATIONS',
        countSource: { kind: 'type', type: 'location' },
      },
      {
        path: 'entities/assets',
        label: 'Assets',
        breadcrumb: 'ASSETS',
        countSource: { kind: 'type', type: 'asset' },
      },
      {
        path: 'entities/artifacts',
        label: 'Artifacts & Objects',
        breadcrumb: 'ARTIFACTS & OBJECTS',
        countSource: { kind: 'type', type: 'artifact' },
      },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    items: [
      {
        path: 'events',
        label: 'All Events',
        breadcrumb: 'ALL EVENTS',
        countSource: { kind: 'derived-events-all' },
      },
      {
        path: 'events/incidents',
        label: 'Incidents',
        breadcrumb: 'INCIDENTS',
        countSource: { kind: 'type', type: 'incident' },
      },
      {
        path: 'events/headlines',
        label: 'Headlines',
        breadcrumb: 'HEADLINES',
        countSource: { kind: 'type', type: 'headline' },
      },
      {
        path: 'events/globalaffairs',
        label: 'Global Affairs',
        breadcrumb: 'GLOBAL AFFAIRS',
        countSource: { kind: 'type', type: 'global_affair' },
      },
    ],
  },
];

/**
 * Flat list of every nav item across every group, in canonical order.
 * Convenient for the router (one `<Route>` per entry) and for the
 * breadcrumb lookup in the toolbar.
 */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The default nav segment — used as the landing target inside a campaign. */
export const DEFAULT_NAV_SEGMENT = 'operations';

/**
 * Build the absolute URL for a nav segment inside a specific campaign.
 *
 * @example campaignPath('abc-123', 'subjects/agents') → '/campaigns/abc-123/subjects/agents'
 */
export function campaignPath(campaignId: string, segment: string): string {
  return `/campaigns/${campaignId}/${segment}`;
}
