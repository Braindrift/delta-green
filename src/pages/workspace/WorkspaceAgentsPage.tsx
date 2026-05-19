/**
 * Workspace — Agents roster (full-width page).
 *
 * Thin wrapper around the shared [[agent-roster-panel]]
 * (`src/components/agents/AgentRosterPanel.tsx`). Same roster body that
 * renders on the landing-page right column shows here at page width with
 * the larger "AGENTS" heading. All loading, error, empty, create-modal,
 * and delete-modal logic lives in the shared component — this page is
 * a one-line consumer (DEL-65).
 */

import { AgentRosterPanel } from '@/components/agents/AgentRosterPanel';

export function WorkspaceAgentsPage() {
  return <AgentRosterPanel />;
}
