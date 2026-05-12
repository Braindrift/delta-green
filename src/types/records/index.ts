/**
 * Public surface for record types.
 *
 * Consumers should import from `@/types/records` rather than reaching into
 * the individual per-type modules — keeps the data layer (DEL-11), form
 * panel (DEL-17), card shell (DEL-18) and downstream tickets decoupled from
 * the internal file layout.
 *
 * The shape mirrors the deployed Supabase schema
 * (`supabase/migrations/20260505213138_initial_schema.sql`) — see design
 * doc §6 for the binding column ↔ JSONB split.
 */

/* ---------- cross-cutting ---------- */
export type {
  BaseData,
  Bond,
  CustodyEntry,
  Member,
  OrganisationAsset,
  Photo,
  RecordRow,
  RecordType,
  Session,
  VisibilityOverrides,
} from './common';
export { RECORD_TYPES } from './common';

/* ---------- per-type rows + their `data` payloads ---------- */
export type {
  AgentData,
  AgentRecord,
  AgentRole,
  AgentStats,
  AgentStatus,
  FriendlyAwareness,
  FriendlyReliability,
  FriendlyRiskLevel,
} from './agent';
export type {
  ArtifactClassification,
  ArtifactData,
  ArtifactRecord,
  ArtifactStatus,
} from './artifact';
export type { AssetClassification, AssetData, AssetRecord, AssetStatus } from './asset';
export type { CivilianData, CivilianRecord, CivilianStatus } from './civilian';
export type {
  GlobalAffairClassification,
  GlobalAffairData,
  GlobalAffairRecord,
} from './global_affair';
export type { HeadlineData, HeadlineRecord, HeadlineScope } from './headline';
export type { IncidentData, IncidentRecord, IncidentStatus, IncidentThreatLevel } from './incident';
export type {
  LocationClassification,
  LocationData,
  LocationRecord,
  LocationStatus,
} from './location';
export type {
  ConspiracyBoardLayout,
  OperationData,
  OperationRecord,
  OperationStatus,
  OperationThreatLevel,
} from './operation';
export type {
  OrganisationAlignment,
  OrganisationClassification,
  OrganisationData,
  OrganisationRecord,
  OrganisationStatus,
} from './organisation';
export type { PoiClassification, PoiData, PoiRecord, PoiStatus, PoiThreatLevel } from './poi';
export type {
  UnnaturalClassification,
  UnnaturalData,
  UnnaturalRecord,
  UnnaturalStatus,
  UnnaturalThreatLevel,
} from './unnatural';

/* ---------- unions + maps ---------- */
export type { AnyRecord, RecordDataMap, RecordTypeMap } from './union';

/* ---------- helpers ---------- */
export { deriveDisplayIdSuffix, formatDisplayId } from './display-id';
export { createDefault, type RecordDraft } from './defaults';
