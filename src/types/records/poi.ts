/**
 * `poi` record — Person of Interest. Plot-relevant NPCs, suspects, cultists.
 *
 * Per design doc §6.5.
 */

import type { BaseData, RecordRow } from './common';

export type PoiStatus = 'active' | 'deceased' | 'missing' | 'unknown';

export type PoiClassification = 'unknown' | 'suspect' | 'informant' | 'hostile' | 'victim';

export type PoiThreatLevel = 'low' | 'moderate' | 'severe' | 'unnatural';

export type PoiData = BaseData & {
  aliases?: string[];
  status?: PoiStatus;
  classification?: PoiClassification;
  threat?: PoiThreatLevel;
  /** UUID → `location` record. */
  location_id?: string;
  /** UUID → `organisation` record. */
  affiliation_id?: string;
};

export type PoiRecord = RecordRow<'poi', PoiData>;
