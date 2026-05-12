/**
 * `operation` record — the top-level case file.
 *
 * Per design doc §6.5. Sessions are an inline array on `data.sessions[]` for
 * per-operation logging; the top-level `sessions` table is reserved for
 * future cross-operation session tracking.
 *
 * `conspiracy_board` carries the board layout JSON managed by DEL-24. Until
 * that ticket lands the value is always null on freshly-created operations.
 */

import type { BaseData, RecordRow, Session } from './common';

export type OperationStatus = 'active' | 'closed' | 'compromised';

export type OperationThreatLevel = 'low' | 'moderate' | 'severe' | 'unnatural';

/**
 * Board layout JSON for the per-operation conspiracy board (DEL-24).
 *
 * Treated as an opaque blob at the type-system level — DEL-24 owns the
 * concrete schema. Typed as `unknown` here to forbid accidental access until
 * a proper shape is defined.
 */
export type ConspiracyBoardLayout = Record<string, unknown>;

export type OperationData = BaseData & {
  /** Short tagline / cover phrase. */
  codename?: string;
  status: OperationStatus;
  threat_level?: OperationThreatLevel;
  /** ISO date the operation was opened. */
  date_opened?: string;
  /** ISO date the operation was closed. Null while still active. */
  date_closed?: string | null;
  /** UUID → `agent` record (case officer, single). */
  officer_id?: string;
  /** UUID → `agent` record (handler, single). */
  handler_id?: string;
  /** UUID → `location` record (primary location, single). */
  location_id?: string;
  /** Cover story shown to civilian eyes. */
  cover?: string;
  /** Inline session log entries. See note above re. top-level `sessions` table. */
  sessions: Session[];
  /** Board layout JSONB. Null until populated by DEL-24. */
  conspiracy_board: ConspiracyBoardLayout | null;
};

export type OperationRecord = RecordRow<'operation', OperationData>;
