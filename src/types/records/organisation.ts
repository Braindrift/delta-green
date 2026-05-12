/**
 * `organisation` record — agencies, corporations, cults, cells.
 *
 * Per design doc §6.5.
 */

import type { BaseData, Member, OrganisationAsset, RecordRow } from './common';

export type OrganisationStatus = 'active' | 'neutralised' | 'unknown';

export type OrganisationClassification =
  | 'government_agency'
  | 'military'
  | 'law_enforcement'
  | 'corporation'
  | 'cult'
  | 'other';

export type OrganisationAlignment = 'friendly' | 'hostile' | 'neutral' | 'unknown';

export type OrganisationData = BaseData & {
  status?: OrganisationStatus;
  classification?: OrganisationClassification;
  alignment?: OrganisationAlignment;
  /** Per-record membership. Each entry's `record_id` typically points at an agent, civilian, or poi. */
  members?: Member[];
  /** UUIDs → `location` records. */
  location_ids?: string[];
  /** UUID → parent `organisation` record. */
  parent_org_id?: string;
  /** Free-form asset inventory. Each entry's optional `linked_id` may point at an `asset` record. */
  assets?: OrganisationAsset[];
};

export type OrganisationRecord = RecordRow<'organisation', OrganisationData>;
