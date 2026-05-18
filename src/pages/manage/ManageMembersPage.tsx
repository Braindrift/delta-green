import { SectionPlaceholder } from '@/pages/sections/SectionPlaceholder';

/**
 * Placeholder for the Members management screen. The real implementation
 * (member list, invite, kick) lands in DEL-44.
 */
export function ManageMembersPage() {
  return (
    <SectionPlaceholder
      title="Members"
      subtitle="Handler controls — invites, agents, former members"
      ticket="DEL-44"
    />
  );
}
