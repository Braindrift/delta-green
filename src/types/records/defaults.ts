/**
 * Factory for sane, type-safe defaults when creating a new record.
 *
 * The returned shape omits server-set fields (`id`, `created_at`,
 * `updated_at`, `deleted_at`) and the campaign scoping (`campaign_id`) —
 * the caller (form panel / SmartRef stub creator) is responsible for those.
 *
 * Each variant's `data` payload starts with the design-doc-required defaults:
 *
 *   - empty `narrative`, empty `photos`, `is_stub: false`
 *   - sensible status / classification defaults where the design doc names them
 *   - all other optional fields left undefined
 *
 * Used by:
 *
 *   - the form panel for new-record creation (DEL-17)
 *   - the SmartRef stub-creation path (DEL-16), which then flips `is_stub`
 *     to `true` on the returned shape before insert
 *
 * Return type is the discriminated row minus server-set fields, preserving
 * the link between `record_type` and the matching `data` shape.
 */

import type { AgentData } from './agent';
import type { ArtifactData } from './artifact';
import type { AssetData } from './asset';
import type { CivilianData } from './civilian';
import type { BaseData, RecordType } from './common';
import type { GlobalAffairData } from './global_affair';
import type { HeadlineData } from './headline';
import type { IncidentData } from './incident';
import type { LocationData } from './location';
import type { OperationData } from './operation';
import type { OrganisationData } from './organisation';
import type { PoiData } from './poi';
import type { RecordTypeMap } from './union';
import type { UnnaturalData } from './unnatural';

/**
 * The shape returned by `createDefault` — a row stripped of server-managed
 * fields, preserving the discriminator → `data` linkage.
 */
export type RecordDraft<T extends RecordType = RecordType> = Omit<
  RecordTypeMap[T],
  'id' | 'campaign_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

/** Fields shared by every type's `data` payload. */
const baseData: BaseData = {
  narrative: '',
  photos: [],
  is_stub: false,
};

/** `data` defaults per record type. */
function defaultDataFor(type: RecordType): RecordTypeMap[RecordType]['data'] {
  switch (type) {
    case 'operation': {
      const data: OperationData = {
        ...baseData,
        status: 'active',
        sessions: [],
        conspiracy_board: null,
      };
      return data;
    }
    case 'agent': {
      const data: AgentData = {
        ...baseData,
        role: 'player_agent',
        status: 'active',
      };
      return data;
    }
    case 'civilian': {
      const data: CivilianData = {
        ...baseData,
        status: 'active',
      };
      return data;
    }
    case 'poi': {
      const data: PoiData = {
        ...baseData,
        status: 'active',
        classification: 'unknown',
        threat: 'low',
      };
      return data;
    }
    case 'unnatural': {
      const data: UnnaturalData = {
        ...baseData,
        status: 'unknown',
        classification: 'unknown',
        threat_level: 'unnatural',
        is_humanoid: false,
      };
      return data;
    }
    case 'organisation': {
      const data: OrganisationData = {
        ...baseData,
        status: 'active',
        classification: 'other',
        alignment: 'unknown',
        members: [],
        location_ids: [],
        assets: [],
      };
      return data;
    }
    case 'location': {
      const data: LocationData = {
        ...baseData,
        status: 'active',
        classification: 'place',
      };
      return data;
    }
    case 'asset': {
      const data: AssetData = {
        ...baseData,
        status: 'available',
        classification: 'other',
        is_abstract: false,
      };
      return data;
    }
    case 'artifact': {
      const data: ArtifactData = {
        ...baseData,
        status: 'secured',
        classification: 'object',
        is_unnatural: false,
        chain_of_custody: [],
      };
      return data;
    }
    case 'incident': {
      const data: IncidentData = {
        ...baseData,
        status: 'open',
        threat_level: 'low',
        is_unnatural: false,
      };
      return data;
    }
    case 'headline': {
      const data: HeadlineData = {
        ...baseData,
        scope: 'local',
        is_relevant: false,
      };
      return data;
    }
    case 'global_affair': {
      const data: GlobalAffairData = {
        ...baseData,
        classification: 'civilian',
      };
      return data;
    }
  }
}

/**
 * Returns a sane default draft for a new record of the given type.
 *
 * The return type is narrowed to the matching variant — passing `'operation'`
 * gives back something whose `.data.status` is `OperationStatus`.
 *
 * Callers are expected to overwrite `name` before insert. SmartRef stubs
 * additionally set `data.is_stub = true`.
 */
export function createDefault<T extends RecordType>(type: T): RecordDraft<T> {
  // The double cast is necessary because TypeScript cannot relate the
  // discriminator narrowing inside `defaultDataFor` back to the generic `T`
  // at the call site — the return type of `defaultDataFor` is the full union.
  // Both ends of `defaultDataFor`'s switch are statically type-checked
  // against their per-type `Data` interface, so the discriminator and data
  // payload are guaranteed to line up at runtime.
  const draft = {
    record_type: type,
    name: '',
    tags: [],
    date_encountered: null,
    visibility_overrides: {},
    data: defaultDataFor(type),
  };
  return draft as unknown as RecordDraft<T>;
}
