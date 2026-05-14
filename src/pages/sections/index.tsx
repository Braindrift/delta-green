/**
 * Placeholder section-view pages — one per nav leaf in `navConfig.ts`.
 *
 * Every leaf renders a `SectionPlaceholder` with the title/subtitle from
 * the design doc and a pointer to the DEL ticket that will replace it.
 *
 * Why one file rather than 14:
 *
 *  - These are throwaway by design — DEL-19 through DEL-22 will land
 *    real per-type list views (`OperationsListView`, etc.) and these
 *    placeholders will be deleted wholesale. Keeping them grouped makes
 *    the deletion a single-file edit.
 *  - The shape is uniform enough that 14 separate files would be
 *    more navigation cost than they're worth.
 *
 * Per design doc §15 the registry starts empty, so for DEL-14 there's no
 * data to display anyway — the placeholder is the entire content.
 */

import { SectionPlaceholder } from '@/pages/sections/SectionPlaceholder';

/* ── OPERATIONS ───────────────────────────────────────────────────── */

export function OperationsAllPage() {
  return (
    <SectionPlaceholder
      title="All Operations"
      subtitle="Complete operational registry // Delta Green Program"
      ticket="DEL-19"
    />
  );
}

export function OperationsActivePage() {
  return (
    <SectionPlaceholder
      title="Active Operations"
      subtitle="Currently running cases"
      ticket="DEL-19"
    />
  );
}

export function OperationsClosedPage() {
  return (
    <SectionPlaceholder
      title="Closed Operations"
      subtitle="Concluded cases — archived"
      ticket="DEL-19"
    />
  );
}

export function OperationsCompromisedPage() {
  return (
    <SectionPlaceholder
      title="Compromised Operations"
      subtitle="Operations exposed or burned"
      ticket="DEL-19"
    />
  );
}

/* ── SUBJECTS ─────────────────────────────────────────────────────── */

export function AgentsPage() {
  return (
    <SectionPlaceholder
      title="Agents"
      subtitle="Player agents, DG NPC agents, and friendlies"
      ticket="DEL-20"
    />
  );
}

export function CiviliansPage() {
  return (
    <SectionPlaceholder
      title="Civilians"
      subtitle="Low-significance NPCs and bystanders"
      ticket="DEL-20"
    />
  );
}

export function PoiPage() {
  return (
    <SectionPlaceholder
      title="Persons of Interest"
      subtitle="Plot-relevant NPCs, suspects, cultists"
      ticket="DEL-20"
    />
  );
}

export function UnnaturalPage() {
  return (
    <SectionPlaceholder
      title="Unnatural"
      subtitle="Supernatural, alien, and occult entities"
      ticket="DEL-20"
    />
  );
}

/* ── ENTITIES ─────────────────────────────────────────────────────── */

export function OrganisationsPage() {
  return (
    <SectionPlaceholder
      title="Organisations"
      subtitle="Agencies, corporations, cults, cells"
      ticket="DEL-21"
    />
  );
}

export function LocationsPage() {
  return (
    <SectionPlaceholder
      title="Locations"
      subtitle="Sites of operational significance"
      ticket="DEL-21"
    />
  );
}

export function AssetsPage() {
  return (
    <SectionPlaceholder
      title="Assets"
      subtitle="Physical and abstract resources"
      ticket="DEL-21"
    />
  );
}

export function ArtifactsPage() {
  return (
    <SectionPlaceholder
      title="Artifacts & Objects"
      subtitle="Evidence, recovered items, unnatural objects"
      ticket="DEL-21"
    />
  );
}

/* ── EVENTS ───────────────────────────────────────────────────────── */

export function EventsAllPage() {
  return (
    <SectionPlaceholder
      title="All Events"
      subtitle="Incidents, headlines, and global affairs"
      ticket="DEL-22"
    />
  );
}

export function IncidentsPage() {
  return (
    <SectionPlaceholder
      title="Incidents"
      subtitle="Discrete supernatural events"
      ticket="DEL-22"
    />
  );
}

export function HeadlinesPage() {
  return (
    <SectionPlaceholder
      title="Headlines"
      subtitle="Press coverage and world-building"
      ticket="DEL-22"
    />
  );
}

export function GlobalAffairsPage() {
  return (
    <SectionPlaceholder
      title="Global Affairs"
      subtitle="Geopolitical context and campaign backdrop"
      ticket="DEL-22"
    />
  );
}
