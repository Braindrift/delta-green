/**
 * `unnatural` record — supernatural / alien / occult entities.
 *
 * Per design doc §6.5.
 */

import type { BaseData, RecordRow } from './common';

export type UnnaturalStatus = 'active' | 'neutralised' | 'unknown';

export type UnnaturalClassification =
  | 'alien'
  | 'occult'
  | 'mythological'
  | 'supernatural'
  | 'unknown';

export type UnnaturalThreatLevel = 'low' | 'moderate' | 'severe' | 'unnatural';

export type UnnaturalData = BaseData & {
  aliases?: string[];
  status?: UnnaturalStatus;
  classification?: UnnaturalClassification;
  threat_level?: UnnaturalThreatLevel;
  is_humanoid?: boolean;
  /** UUID → `location` record. */
  location_id?: string;
};

export type UnnaturalRecord = RecordRow<'unnatural', UnnaturalData>;
