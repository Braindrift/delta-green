/**
 * `location` record — sites of significance.
 *
 * Per design doc §6.5. The map feature (Phase 5) extends this `data` shape
 * with `lat`/`lng`/`geoJson` fields — those will be added in DEL-23 rather
 * than pre-declared here. Keeping `location` schema-honest now means the
 * map skill owns the geo fields when it lands.
 */

import type { BaseData, RecordRow } from './common';

export type LocationStatus = 'active' | 'destroyed' | 'unknown';

export type LocationClassification = 'place' | 'building' | 'other';

export type LocationData = BaseData & {
  status?: LocationStatus;
  classification?: LocationClassification;
  address?: string;
  region?: string;
  country?: string;
};

export type LocationRecord = RecordRow<'location', LocationData>;
