/**
 * `incident` record — discrete supernatural events.
 *
 * Per design doc §6.5.
 */

import type { BaseData, RecordRow } from './common';

export type IncidentStatus = 'open' | 'resolved' | 'unresolved';

export type IncidentThreatLevel = 'low' | 'moderate' | 'severe' | 'unnatural';

export type IncidentData = BaseData & {
  status?: IncidentStatus;
  threat_level?: IncidentThreatLevel;
  is_unnatural?: boolean;
  /** ISO date (`YYYY-MM-DD`). */
  date_occurred?: string;
  /** UUID → `location` record. */
  location_id?: string;
};

export type IncidentRecord = RecordRow<'incident', IncidentData>;
