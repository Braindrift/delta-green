/**
 * `civilian` record — low-significance NPCs, bystanders, witnesses.
 *
 * Per design doc §6.5.
 */

import type { BaseData, RecordRow } from './common';

export type CivilianStatus = 'active' | 'deceased' | 'missing';

export type CivilianData = BaseData & {
  status?: CivilianStatus;
  aliases?: string[];
  profession?: string;
  /** Free-text location-of-last-sighting. Distinct from the structural `location_id` ref. */
  last_seen_at?: string;
  /** UUID → `location` record. */
  location_id?: string;
};

export type CivilianRecord = RecordRow<'civilian', CivilianData>;
