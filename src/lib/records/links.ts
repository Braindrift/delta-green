/**
 * Cross-record link operations against the `linked_records` join table.
 *
 * `linked_records` is the source of truth for SmartRef cross-references.
 * There is no `linked_ids` array on records — see design doc §6.5. The
 * SmartRef component (DEL-16) reads via `getLinkedRecords` and writes via
 * `linkRecords` / `unlinkRecords`.
 *
 * Pair direction does not matter for either link or unlink — the table's
 * `linked_records_unique_pair_idx` enforces uniqueness over the unordered
 * pair via a `least()/greatest()` expression index, and the unlink helper
 * deletes whichever direction is in the table.
 */

import { supabase } from '@/lib/supabase';
import type { AnyRecord } from '@/types/records';
import { mapPostgrestError, ok, unknown, type Result } from './errors';

/* -------------------------------------------------------------------------- */
/*  Write operations                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Link two records. Idempotent: if a row already exists for this unordered
 * pair (in either direction), the unique-violation 23505 is mapped to a
 * successful `Ok<void>` rather than surfacing as a conflict — "already
 * linked" is the desired end state.
 *
 * RLS allows GMs of the campaign only. Non-GMs get a `forbidden` Result.
 */
export async function linkRecords(
  campaignId: string,
  idA: string,
  idB: string,
): Promise<Result<void>> {
  const { error } = await supabase.from('linked_records').insert({
    campaign_id: campaignId,
    record_id_a: idA,
    record_id_b: idB,
  });

  if (error) {
    const mapped = mapPostgrestError(error);
    // Unique-violation on the unordered-pair index means the link already
    // exists. Treat as success — SmartRef calls linkRecords without
    // pre-checking, and the user-visible end state is the same either way.
    if (!mapped.ok && mapped.kind === 'conflict') {
      return ok(undefined);
    }
    return mapped;
  }

  return ok(undefined);
}

/**
 * Remove the link between two records. Order-agnostic — matches against
 * both `(idA, idB)` and `(idB, idA)` so callers don't have to know which
 * direction was stored.
 *
 * Returns ok even if no row was matched: "already unlinked" is the same
 * end state from the user's perspective.
 *
 * RLS allows GMs of the campaign only.
 */
export async function unlinkRecords(
  campaignId: string,
  idA: string,
  idB: string,
): Promise<Result<void>> {
  // PostgREST's `.or()` syntax: each clause is `column.op.value`, separated
  // by commas. The `and()` wrapper groups the per-direction column pairs.
  const { error } = await supabase
    .from('linked_records')
    .delete()
    .eq('campaign_id', campaignId)
    .or(
      `and(record_id_a.eq.${idA},record_id_b.eq.${idB}),and(record_id_a.eq.${idB},record_id_b.eq.${idA})`,
    );

  if (error) return mapPostgrestError(error);
  return ok(undefined);
}

/* -------------------------------------------------------------------------- */
/*  Read operations                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Return every record linked to the given one, regardless of direction.
 *
 * Implementation: two parallel selects (one per direction) joining
 * `linked_records` to `records`. Results are merged client-side and
 * de-duplicated by record id — symmetric pairs would otherwise show up
 * twice if the row happened to be stored in both directions (which the
 * unique index prevents, but the merge is cheap belt-and-suspenders).
 *
 * Linked rows respect the same RLS as plain `getRecord` calls — GMs see
 * everything, players see only records published to them.
 */
export async function getLinkedRecords(
  campaignId: string,
  id: string,
): Promise<Result<AnyRecord[]>> {
  // Direction A → B: rows where record_id_a is `id`, return the linked record_id_b
  const [forwardResult, reverseResult] = await Promise.all([
    supabase
      .from('linked_records')
      .select('linked:records!linked_records_record_id_b_fkey(*)')
      .eq('campaign_id', campaignId)
      .eq('record_id_a', id),
    supabase
      .from('linked_records')
      .select('linked:records!linked_records_record_id_a_fkey(*)')
      .eq('campaign_id', campaignId)
      .eq('record_id_b', id),
  ]);

  if (forwardResult.error) return mapPostgrestError(forwardResult.error);
  if (reverseResult.error) return mapPostgrestError(reverseResult.error);

  const forwardRows = forwardResult.data ?? [];
  const reverseRows = reverseResult.data ?? [];

  // The PostgREST embedded-select shape is `{ linked: Row | Row[] }`. With a
  // single FK target it's a singular object, but the JS client types it as
  // `Row | Row[]` to be safe — flatten to a uniform array first.
  type Embedded = { linked: AnyRecord | AnyRecord[] | null };
  const flatten = (rows: Embedded[]): AnyRecord[] =>
    rows.flatMap((r) => {
      if (r.linked === null) return [];
      return Array.isArray(r.linked) ? r.linked : [r.linked];
    });

  // `linked_records` has two FKs into `records` (record_id_a / record_id_b), so
  // the embed is disambiguated by the FK-constraint-name hint above — that lets
  // the typed client resolve `linked` to a `records` row. The cast only narrows
  // the generated row (`data: Json`) to our `AnyRecord` union, the same bridge
  // the rest of the records read path uses.
  const all = [...flatten(forwardRows as Embedded[]), ...flatten(reverseRows as Embedded[])];

  // De-dupe by id. With the unique-pair index in place this is defensive,
  // but the cost is negligible.
  const seen = new Set<string>();
  const deduped: AnyRecord[] = [];
  for (const row of all) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }

  if (deduped.length === 0 && (forwardResult.data === null || reverseResult.data === null)) {
    return unknown(new Error('linked_records query returned null data'));
  }
  return ok(deduped);
}
