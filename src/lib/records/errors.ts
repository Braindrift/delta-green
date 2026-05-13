/**
 * Typed result + error helpers for the records data access layer.
 *
 * Every function in `@/lib/records` returns `Promise<Result<T>>` rather than
 * throwing. Callers branch on `result.ok` and get an exhaustive set of error
 * variants to handle — this makes the UI's render-by-error-kind logic
 * trivial and forces every call site to deal with the failure path.
 *
 * `forbidden` is reserved for cases where Postgres actually returns an RLS
 * error code (mostly on insert/update from non-GMs). RLS-denied reads come
 * back as empty results from PostgREST — we map those to `not_found`. This
 * is the correct behaviour for players, who must not learn that hidden
 * records exist.
 */

import type { PostgrestError } from '@supabase/supabase-js';

/** Successful result. */
export type Ok<T> = { ok: true; data: T };

/** Error variants. Exhaustive — `kind` is a literal union. */
export type Err =
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'forbidden'; cause: PostgrestError }
  | { ok: false; kind: 'conflict'; cause: PostgrestError }
  | { ok: false; kind: 'unknown'; cause: PostgrestError | Error };

export type Result<T> = Ok<T> | Err;

/* -------------------------------------------------------------------------- */
/*  Constructors                                                              */
/* -------------------------------------------------------------------------- */

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function notFound(): Err {
  return { ok: false, kind: 'not_found' };
}

export function forbidden(cause: PostgrestError): Err {
  return { ok: false, kind: 'forbidden', cause };
}

export function conflict(cause: PostgrestError): Err {
  return { ok: false, kind: 'conflict', cause };
}

export function unknown(cause: PostgrestError | Error): Err {
  return { ok: false, kind: 'unknown', cause };
}

/* -------------------------------------------------------------------------- */
/*  PostgREST error code mapping                                              */
/* -------------------------------------------------------------------------- */

/**
 * PostgREST returns a 5-character `code` field on errors that we can use to
 * distinguish RLS denials, unique-violation conflicts, and not-found from
 * the generic unknown bucket.
 *
 * References:
 *   - PostgREST docs: https://postgrest.org/en/stable/errors.html
 *   - Postgres SQLSTATE: https://www.postgresql.org/docs/current/errcodes-appendix.html
 *
 * The notable ones we map:
 *
 *   - `23505` — Postgres unique_violation, surfaces on duplicate
 *     `linked_records` pair insert. Maps to `conflict`.
 *   - `42501` — Postgres insufficient_privilege, surfaces when an
 *     authenticated user is blocked by RLS on insert/update/delete. Maps to
 *     `forbidden`.
 *   - `PGRST116` — PostgREST "JSON object requested, multiple (or no) rows
 *     returned" — emitted by `.single()` when zero rows match. Maps to
 *     `not_found`. (Note: PostgREST returns this *as* the error code, not as
 *     an SQLSTATE.)
 */
export function mapPostgrestError(error: PostgrestError): Err {
  switch (error.code) {
    case '23505':
      return conflict(error);
    case '42501':
      return forbidden(error);
    case 'PGRST116':
      return notFound();
    default:
      return unknown(error);
  }
}
