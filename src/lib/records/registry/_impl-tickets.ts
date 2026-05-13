/**
 * Internal: maps each record type to the DEL ticket that will replace its
 * placeholder UI components with real implementations. Surfaced inside the
 * placeholder components so a reader lands on the right ticket without
 * having to trace the dependency graph.
 *
 * Kept as a plain `.ts` (not `.tsx`) so the placeholders file only exports
 * components — the React Fast Refresh lint rule fires otherwise.
 */

import type { RecordType } from '@/types/records';

export const IMPL_TICKET: Record<RecordType, string> = {
  operation: 'DEL-19',
  agent: 'DEL-20',
  civilian: 'DEL-20',
  poi: 'DEL-20',
  unnatural: 'DEL-20',
  organisation: 'DEL-21',
  location: 'DEL-21',
  asset: 'DEL-21',
  artifact: 'DEL-21',
  incident: 'DEL-22',
  headline: 'DEL-22',
  global_affair: 'DEL-22',
};
