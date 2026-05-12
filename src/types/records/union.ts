/**
 * Discriminated union of every record variant, plus the type-map lookup used
 * by helpers and registries that need to map a `RecordType` literal back to
 * the concrete row type.
 *
 * `AnyRecord` is the type consumers should reach for when dealing with a row
 * of unknown variety (list views, search results, the data access layer).
 * Narrowing on `record_type` then gives the correct `data` shape:
 *
 * ```ts
 * function describe(rec: AnyRecord) {
 *   if (rec.record_type === 'operation') {
 *     rec.data.status; // OperationStatus — inferred
 *   }
 * }
 * ```
 */

import type { AgentRecord } from './agent';
import type { ArtifactRecord } from './artifact';
import type { AssetRecord } from './asset';
import type { CivilianRecord } from './civilian';
import type { GlobalAffairRecord } from './global_affair';
import type { HeadlineRecord } from './headline';
import type { IncidentRecord } from './incident';
import type { LocationRecord } from './location';
import type { OperationRecord } from './operation';
import type { OrganisationRecord } from './organisation';
import type { PoiRecord } from './poi';
import type { UnnaturalRecord } from './unnatural';

/**
 * Any record, narrowed by `record_type`. Use this as the default type for
 * functions that handle rows of unknown variety.
 */
export type AnyRecord =
  | OperationRecord
  | AgentRecord
  | CivilianRecord
  | PoiRecord
  | UnnaturalRecord
  | OrganisationRecord
  | LocationRecord
  | AssetRecord
  | ArtifactRecord
  | IncidentRecord
  | HeadlineRecord
  | GlobalAffairRecord;

/**
 * Lookup table mapping each `RecordType` literal to its concrete row type.
 * Useful for generic helpers like
 * `getRecord<T extends RecordType>(id: string): Promise<RecordTypeMap[T]>`.
 */
export type RecordTypeMap = {
  operation: OperationRecord;
  agent: AgentRecord;
  civilian: CivilianRecord;
  poi: PoiRecord;
  unnatural: UnnaturalRecord;
  organisation: OrganisationRecord;
  location: LocationRecord;
  asset: AssetRecord;
  artifact: ArtifactRecord;
  incident: IncidentRecord;
  headline: HeadlineRecord;
  global_affair: GlobalAffairRecord;
};

/**
 * The `data` payload for a given record type. Inverse of the discriminated
 * union — convenient for code that operates only on the JSONB payload (e.g.
 * the form panel's per-section components).
 */
export type RecordDataMap = {
  [K in keyof RecordTypeMap]: RecordTypeMap[K]['data'];
};
