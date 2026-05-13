/**
 * The record type registry.
 *
 * Each of the 12 record types has a sibling module (`./operation.ts`,
 * `./agent.ts`, …) exporting a `RecordTypeDefinition` for that type.
 * This file collects them into a single typed map and exposes the helper
 * API every downstream consumer uses.
 *
 * Adding a new record type is a two-step operation:
 *
 *   1. Add the type to `RecordType` in `@/types/records/common.ts` and
 *      the deployed schema's CHECK constraint (with a migration).
 *   2. Write `src/lib/records/registry/<type>.ts` exporting a
 *      `RecordTypeDefinition<'<type>'>`. Add one import line below.
 *
 * The typed map gives consumers variant-narrowed access: indexing
 * `recordTypeRegistry.operation` returns `RecordTypeDefinition<'operation'>`
 * with the correct `FormComponent`, `CardComponent`, and `ListItemComponent`
 * signatures.
 */

import {
  formatDisplayId,
  RECORD_TYPES,
  type AnyRecord,
  type RecordRow,
  type RecordType,
} from '@/types/records';

import { agentDefinition } from './agent';
import { artifactDefinition } from './artifact';
import { assetDefinition } from './asset';
import { civilianDefinition } from './civilian';
import { globalAffairDefinition } from './global_affair';
import { headlineDefinition } from './headline';
import { incidentDefinition } from './incident';
import { locationDefinition } from './location';
import { operationDefinition } from './operation';
import { organisationDefinition } from './organisation';
import { poiDefinition } from './poi';
import type { AnyRecordTypeDefinition, RecordTypeDefinition, RecordTypeRegistry } from './types';
import { unnaturalDefinition } from './unnatural';

/* -------------------------------------------------------------------------- */
/*  The registry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The single source of truth for "what record types exist and how should
 * they be rendered/labelled?" — keyed by `RecordType`.
 *
 * Use `getRecordTypeDefinition(type)` rather than indexing this map
 * directly when the type is dynamic (an `AnyRecord`'s `record_type`,
 * say) — the helper gives a clearer call site and exhaustiveness errors
 * if the registry ever falls out of sync with `RecordType`.
 */
export const recordTypeRegistry: RecordTypeRegistry = {
  operation: operationDefinition,
  agent: agentDefinition,
  civilian: civilianDefinition,
  poi: poiDefinition,
  unnatural: unnaturalDefinition,
  organisation: organisationDefinition,
  location: locationDefinition,
  asset: assetDefinition,
  artifact: artifactDefinition,
  incident: incidentDefinition,
  headline: headlineDefinition,
  global_affair: globalAffairDefinition,
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fetch a record type's definition. Variant-narrowed: passing a literal
 * type gives back the exact `RecordTypeDefinition<T>`.
 */
export function getRecordTypeDefinition<T extends RecordType>(type: T): RecordTypeDefinition<T> {
  // The cast is necessary because the indexed access through the generic
  // `T` is widened to the union by TypeScript. The map is keyed by exactly
  // the same set of literals, so the cast is safe.
  return recordTypeRegistry[type] as RecordTypeDefinition<T>;
}

/**
 * The complete list of definitions, in canonical display order. Useful
 * for sidebar/dropdown rendering. Order matches `RECORD_TYPES` from
 * `@/types/records`.
 *
 * Element type is `AnyRecordTypeDefinition` (the union of all variants)
 * rather than `RecordTypeDefinition<RecordType>` — see the type doc for
 * why the variance forces the union form here.
 */
export const recordTypeDefinitions: readonly AnyRecordTypeDefinition[] = RECORD_TYPES.map(
  (t) => recordTypeRegistry[t],
);

/**
 * Derive the human-readable display ID for a record (e.g. `OP-A1B2C3`).
 * Pulls the prefix from the registry, the suffix from the UUID.
 *
 * This is the canonical entry point — consumers should call this rather
 * than `formatDisplayId(label, uuid)` directly, because the registry owns
 * the per-type prefix.
 */
export function getDisplayId(record: Pick<RecordRow, 'id' | 'record_type'>): string {
  const def = recordTypeRegistry[record.record_type];
  return formatDisplayId(def.label, record.id);
}

/**
 * Returns the registry definitions that can hold a SmartRef link *to* a
 * record of the given type. Honours the optional `targetableBy` field on
 * each definition: a missing `targetableBy` means "any type can link to
 * me", which is the default.
 *
 * Per-field allow-lists (which subset of these targets a specific form
 * field accepts) live on the form components themselves — this helper
 * answers the cross-type "who can target me?" question, not the per-field
 * "what can I accept?" question.
 */
export function getTargetableByDefinitionsFor(
  targetType: RecordType,
): readonly AnyRecordTypeDefinition[] {
  const def = recordTypeRegistry[targetType];
  if (!def.targetableBy) {
    // Default: any type can link to this one.
    return recordTypeDefinitions;
  }
  const allowed = new Set<RecordType>(def.targetableBy);
  return recordTypeDefinitions.filter((d) => allowed.has(d.type));
}

/* -------------------------------------------------------------------------- */
/*  Re-exports                                                                */
/* -------------------------------------------------------------------------- */

export type {
  AnyRecordTypeDefinition,
  RecordCardProps,
  RecordFormPatch,
  RecordFormProps,
  RecordFormState,
  RecordListItemProps,
  RecordTypeDefinition,
  RecordTypeRegistry,
} from './types';

/**
 * Convenience type alias for a record-type-discriminated component bag,
 * matching the registry's variant narrowing.
 */
export type DefinitionFor<R extends AnyRecord> = RecordTypeDefinition<R['record_type']>;
