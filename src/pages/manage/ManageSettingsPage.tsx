import { SectionPlaceholder } from '@/pages/sections/SectionPlaceholder';

/**
 * Placeholder for the campaign Settings screen. The real implementation
 * — campaign rename, soft-delete (DEL-48), ownership transfer (DEL-49) —
 * lands across those tickets.
 */
export function ManageSettingsPage() {
  return (
    <SectionPlaceholder
      title="Settings"
      subtitle="Campaign-level controls"
      ticket="DEL-48 / DEL-49"
      detail="Delete and transfer-ownership flows arrive with those tickets."
    />
  );
}
