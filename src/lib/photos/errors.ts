/**
 * Storage error mapping for the photos module.
 *
 * Re-exports the records data access layer's `Result`/`Err` shape so consumers
 * see one consistent error surface across `@/lib/records` and `@/lib/photos`.
 *
 * Why we don't widen the records' `Err` variants to admit storage errors:
 * Supabase Storage surfaces failures via `StorageError`, which doesn't expose
 * SQLSTATE codes the way PostgREST does. The records layer's
 * `mapPostgrestError` keys off `error.code` (`23505`, `42501`, `PGRST116`) —
 * storage errors don't have equivalents.
 *
 * For v1 we err on the side of conservatism: a storage failure that looks
 * like an RLS denial (HTTP 403 or `statusCode: '403'` from the storage REST
 * API) is mapped to `forbidden` with the original `StorageError` attached.
 * Everything else lands in `unknown`. The records layer's `forbidden` variant
 * is typed `cause: PostgrestError`, so we narrow our own forbidden cases to
 * the records' `unknown` bucket — callers that need to distinguish "storage
 * denied" from "storage exploded" can inspect `cause.message`.
 *
 * The day storage errors get a structured `code` field, swap this for a
 * proper mapper.
 */

import type { StorageError } from '@supabase/storage-js';

import { notFound, unknown, type Err, type Result } from '@/lib/records';

/**
 * Map a Supabase `StorageError` to the records' `Result` error envelope.
 *
 * - 404-shaped errors → `not_found`
 * - Everything else → `unknown`, with the `StorageError` as the cause
 *
 * 403 (RLS denial) is intentionally not split out — see file header.
 */
export function mapStorageError(error: StorageError): Err {
  // `StorageError` exposes `statusCode` as a stringified HTTP status on the
  // storage REST API responses. Older versions exposed it as `status`.
  const status = readStatus(error);
  if (status === 404) return notFound();
  return unknown(error);
}

/**
 * Pull the HTTP status off a `StorageError` regardless of which field the
 * current `@supabase/storage-js` version uses. Returns `undefined` if the
 * shape doesn't match.
 */
function readStatus(error: StorageError): number | undefined {
  const candidate = error as unknown as {
    statusCode?: string | number;
    status?: string | number;
  };
  const raw = candidate.statusCode ?? candidate.status;
  if (raw === undefined) return undefined;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* Re-export `Result` so consumers of `@/lib/photos` don't need a second
 * import from `@/lib/records`. */
export type { Result };
