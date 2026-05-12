/**
 * `artifact` record — evidence, recovered items, unnatural objects.
 *
 * Per design doc §6.5. Distinct from `asset` because artifacts carry
 * chain-of-custody and recovery semantics. `is_unnatural` flips the visual
 * treatment to the anomalous-object styling in the card layer (DEL-21).
 */

import type { BaseData, CustodyEntry, RecordRow } from './common';

export type ArtifactStatus = 'secured' | 'missing' | 'destroyed' | 'unnatural';

export type ArtifactClassification = 'document' | 'object' | 'artifact';

export type ArtifactData = BaseData & {
  status?: ArtifactStatus;
  classification?: ArtifactClassification;
  is_unnatural?: boolean;
  /** UUID → `location` record where the artifact currently resides. */
  current_location_id?: string;
  chain_of_custody?: CustodyEntry[];
  /** ISO date (`YYYY-MM-DD`). */
  date_recovered?: string;
};

export type ArtifactRecord = RecordRow<'artifact', ArtifactData>;
