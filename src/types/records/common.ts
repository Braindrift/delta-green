/**
 * Cross-cutting types shared by every record variant.
 *
 * The shape mirrors the deployed Supabase schema
 * (`supabase/migrations/20260505213138_initial_schema.sql`) — top-level columns
 * are real `records` columns; type-specific fields live under `data`.
 *
 * See design doc §6 for the binding column ↔ JSONB split.
 */

/* -------------------------------------------------------------------------- */
/*  Record type discriminator                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Canonical record types. Must exactly match the `record_type_valid` CHECK
 * constraint on the `records` table. Snake_case throughout — `global_affair`,
 * not `globalaffair` (prototype's legacy in-memory key was dropped).
 */
export type RecordType =
  | 'operation'
  | 'agent'
  | 'civilian'
  | 'poi'
  | 'unnatural'
  | 'organisation'
  | 'location'
  | 'asset'
  | 'artifact'
  | 'incident'
  | 'headline'
  | 'global_affair';

/**
 * Tuple of every record type, ordered for navigation/registry use.
 * `RecordType` is derived from this so the two cannot drift apart.
 */
export const RECORD_TYPES = [
  'operation',
  'agent',
  'civilian',
  'poi',
  'unnatural',
  'organisation',
  'location',
  'asset',
  'artifact',
  'incident',
  'headline',
  'global_affair',
] as const satisfies readonly RecordType[];

/* -------------------------------------------------------------------------- */
/*  Sub-types referenced by `data` payloads                                   */
/* -------------------------------------------------------------------------- */

/**
 * A photo attached to a record. Stored inside `data.photos[]`.
 *
 * `id` is user-defined and scoped to the owning record (two different records
 * can both have a photo with id `GIRL`). It is the value used by inline
 * `[PHOTO:ID]` tokens in narrative text.
 *
 * `path` is the Supabase Storage object path, not a URL. Signed URLs are
 * derived at render time from the storage client.
 */
export type Photo = {
  /** Unique within the owning record. User-defined, e.g. `GIRL`. Case-sensitive. */
  id: string;
  caption: string;
  /** Optional session reference, e.g. `Session 2`. Empty string if unset. */
  session: string;
  /** Storage object path: `{campaign_id}/{record_id}/{filename}`. */
  path: string;
  /** ISO timestamp. */
  added_at: string;
};

/**
 * An entry in an operation's session log. Stored inside
 * `OperationData.sessions[]`.
 *
 * Distinct from the top-level `sessions` table, which is reserved for richer
 * cross-operation session tracking that we haven't wired up yet.
 */
export type Session = {
  /** Stable identifier for the session entry, unique within the operation. */
  id: string;
  number: number;
  title: string;
  /** Date the session occurred, ISO date (`YYYY-MM-DD`). */
  date: string;
  outcome?: string;
  notes?: string;
};

/**
 * A player agent's personal bond to another character. Stored inside
 * `AgentData.bonds[]` (player-agent role only).
 *
 * `linked_id` references another record's UUID when the bond points at someone
 * in the registry (an agent, civilian, etc.) — independent of the
 * `linked_records` join table, which models structural cross-references.
 */
export type Bond = {
  name: string;
  /** UUID of a linked `records` row, if the bond points at a registered character. */
  linked_id?: string;
  description?: string;
};

/**
 * A membership entry on an organisation. Stored inside
 * `OrganisationData.members[]`.
 */
export type Member = {
  /** UUID of the member record (typically `agent`, `civilian`, or `poi`). */
  record_id: string;
  role: string;
};

/**
 * A single step in an artifact's chain of custody. Stored inside
 * `ArtifactData.chain_of_custody[]`.
 */
export type CustodyEntry = {
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  holder: string;
  notes?: string;
};

/**
 * An asset entry on an organisation. Stored inside
 * `OrganisationData.assets[]`.
 *
 * Free-form descriptive metadata about organisational resources, with an
 * optional `linked_id` pointing at a real `asset` record when one exists.
 */
export type OrganisationAsset = {
  name: string;
  type: string;
  description: string;
  /** UUID of a linked `asset` record, if any. */
  linked_id?: string;
};

/* -------------------------------------------------------------------------- */
/*  Common fields shared by every record's `data` payload                     */
/* -------------------------------------------------------------------------- */

/**
 * Fields present on every record's `data` JSONB, regardless of type.
 *
 * `narrative` is the free-text field report (with optional inline `[PHOTO:ID]`
 * tokens). `photos` is the record's own polaroid attachments. `is_stub` is
 * the SmartRef-created-placeholder flag — see design doc §6.7.
 */
export type BaseData = {
  narrative: string;
  photos: Photo[];
  is_stub: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Visibility overrides                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Field-level visibility instructions, stored in
 * `records.visibility_overrides`. Keys are arbitrary field paths defined by
 * the rendering layer (e.g. `narrative`, `data.cover`). Used by DEL-28 to mask
 * specific fields from players even when the row itself is published.
 */
export type VisibilityOverrides = Record<string, 'visible' | 'hidden'>;

/* -------------------------------------------------------------------------- */
/*  Generic record row                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Generic shape of a `records` row. Variants narrow `record_type` and `data`
 * via the per-type intersections defined in each type's own module — see
 * `union.ts` for the discriminated union of all 12.
 *
 * All `timestamptz` columns are exposed as ISO strings, matching the wire
 * shape returned by `@supabase/supabase-js`.
 */
export type RecordRow<T extends RecordType = RecordType, D extends BaseData = BaseData> = {
  /** UUID. Generated server-side via `gen_random_uuid()`. */
  id: string;
  /** UUID → `campaigns.id`. RLS keys off this. */
  campaign_id: string;
  record_type: T;
  name: string;
  tags: string[];
  /** ISO timestamp of the in-world event. Distinct from `created_at`. */
  date_encountered: string | null;
  visibility_overrides: VisibilityOverrides;
  data: D;
  created_at: string;
  updated_at: string;
  /** Null for live records. Set on soft delete. */
  deleted_at: string | null;
};
