/**
 * `asset` record — physical and abstract resources.
 *
 * Per design doc §6.5.
 */

import type { BaseData, RecordRow } from './common';

export type AssetStatus = 'available' | 'in_use' | 'lost' | 'destroyed';

export type AssetClassification =
  | 'property'
  | 'vehicle'
  | 'weapon'
  | 'financial'
  | 'information'
  | 'influence'
  | 'support'
  | 'other';

export type AssetData = BaseData & {
  status?: AssetStatus;
  classification?: AssetClassification;
  /** True for intangible assets (favours, leverage, access). */
  is_abstract?: boolean;
  /** UUID → owner record (`agent` or `organisation`). */
  owner_id?: string;
  description?: string;
};

export type AssetRecord = RecordRow<'asset', AssetData>;
