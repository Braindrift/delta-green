/**
 * `global_affair` record — geopolitical context, campaign backdrop.
 *
 * Per design doc §6.5.
 *
 * Note: the prototype used `globalaffair` (one word) as the in-memory
 * discriminator. The canonical record_type is `global_affair` and the
 * prototype alias does not survive into the production schema.
 */

import type { BaseData, RecordRow } from './common';

export type GlobalAffairClassification =
  | 'civilian'
  | 'economic'
  | 'diplomacy'
  | 'war'
  | 'terrorism';

export type GlobalAffairData = BaseData & {
  classification?: GlobalAffairClassification;
  /** ISO date (`YYYY-MM-DD`). */
  date?: string;
  region?: string;
};

export type GlobalAffairRecord = RecordRow<'global_affair', GlobalAffairData>;
