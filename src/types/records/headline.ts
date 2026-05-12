/**
 * `headline` record — press coverage, world-building.
 *
 * Per design doc §6.5. Note: for headline records the top-level `records.name`
 * column holds the headline text itself.
 */

import type { BaseData, RecordRow } from './common';

export type HeadlineScope = 'local' | 'regional' | 'national' | 'international';

export type HeadlineData = BaseData & {
  publication?: string;
  scope?: HeadlineScope;
  /** ISO date (`YYYY-MM-DD`). */
  date?: string;
  /** True if connected to an operation. */
  is_relevant?: boolean;
  url?: string;
};

export type HeadlineRecord = RecordRow<'headline', HeadlineData>;
