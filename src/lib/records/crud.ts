/**
 * Record CRUD against the deployed Supabase `records` table.
 *
 * Every function is typed against the interfaces in `@/types/records` so the
 * call site gets variant-narrowed `data` shapes. RLS is enforced at the DB
 * layer — these functions trust the policies and surface PostgREST errors
 * via the typed `Result` from `./errors`.
 *
 * See design doc §6 for the binding column ↔ JSONB split and the deployed
 * schema (`supabase/migrations/20260505213138_initial_schema.sql`).
 */

import { supabase } from '@/lib/supabase';
import type {
  AnyRecord,
  RecordDataMap,
  RecordType,
  RecordTypeMap,
  VisibilityOverrides,
} from '@/types/records';
import { mapPostgrestError, notFound, ok, unknown, type Result } from './errors';

/* -------------------------------------------------------------------------- */
/*  Inputs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Inserted shape for `createRecord`. Server-set fields (`id`, timestamps,
 * `deleted_at`) and the campaign scoping (`campaign_id`) are not part of
 * this — `campaignId` comes through as a separate function argument so the
 * call site can't forget it.
 *
 * The discriminator `record_type` is also a separate argument (`type`) for
 * the same reason — it must match the JSONB `data` shape.
 */
export type CreateRecordInput<T extends RecordType> = {
  name: string;
  data: RecordDataMap[T];
  tags?: string[];
  date_encountered?: string | null;
  visibility_overrides?: VisibilityOverrides;
};

/**
 * Patch shape for `updateRecord`. All fields optional. `data` is shallow-
 * merged with the existing row (per design doc §6 and the ticket spec):
 * keys present in the patch override the existing keys, keys absent are
 * left alone.
 *
 * The merge is performed client-side: the function fetches the current row,
 * computes `{ ...current.data, ...patch.data }`, and writes back. This is a
 * deliberate Phase-1 choice — see the handoff doc for the trade-off vs. an
 * atomic Postgres-side merge via an RPC.
 */
export type UpdateRecordPatch<T extends RecordType> = {
  name?: string;
  tags?: string[];
  date_encountered?: string | null;
  visibility_overrides?: VisibilityOverrides;
  data?: Partial<RecordDataMap[T]>;
};

/* -------------------------------------------------------------------------- */
/*  Operations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Insert a new record. RLS allows GMs of the target campaign only — non-GMs
 * get a `forbidden` Result back.
 *
 * The returned row is narrowed to the variant matching `type`.
 */
export async function createRecord<T extends RecordType>(
  campaignId: string,
  type: T,
  input: CreateRecordInput<T>,
): Promise<Result<RecordTypeMap[T]>> {
  const row = {
    campaign_id: campaignId,
    record_type: type,
    name: input.name,
    data: input.data,
    tags: input.tags ?? [],
    date_encountered: input.date_encountered ?? null,
    visibility_overrides: input.visibility_overrides ?? {},
  };

  const { data, error } = await supabase.from('records').insert(row).select('*').single();

  if (error) return mapPostgrestError(error);
  // The `as` cast bridges PostgREST's `unknown`-style return to our typed
  // row. The insert payload was constructed with `record_type: type`, so
  // the discriminator and `data` shape are guaranteed to line up.
  return ok(data as RecordTypeMap[T]);
}

/**
 * Fetch a single record by UUID, scoped to the given campaign.
 *
 * Empty results — whether the row truly doesn't exist or RLS hid it from
 * the caller — map to `not_found`. This is the correct behaviour: players
 * must not be able to learn that hidden records exist.
 *
 * Soft-deleted rows are excluded by the RLS read policy, so they also come
 * back as `not_found`.
 */
export async function getRecord(campaignId: string, id: string): Promise<Result<AnyRecord>> {
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('id', id)
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return notFound();
  return ok(data as AnyRecord);
}

/**
 * Update a record. Top-level patchable fields are written as columns; `data`
 * is shallow-merged client-side (see `UpdateRecordPatch` for rationale).
 *
 * This is two round-trips by design — a read then a write. The trade-off is
 * documented in the handoff. If concurrent edits start corrupting JSONB at
 * the field level, switch to an atomic Postgres RPC without changing this
 * function's signature.
 *
 * NOTE: The record type is passed as an explicit argument (a minor deviation
 * from the original ticket spec, which had `updateRecord(campaignId, id,
 * patch)`). Without it, TypeScript can't infer the generic `T` from
 * `Partial<RecordDataMap[T]>` and the patch's `data` shape collapses to the
 * full union — meaning callers couldn't pass type-specific fields without
 * casts. Since every UI call site knows the record's type at the moment of
 * update, accepting it as an argument is the cleaner trade.
 */
export async function updateRecord<T extends RecordType>(
  campaignId: string,
  id: string,
  type: T,
  patch: UpdateRecordPatch<T>,
): Promise<Result<RecordTypeMap[T]>> {
  // Phase 1 single-writer assumption: race window between this read and the
  // write below is acceptable. See handoff for the upgrade path.
  let mergedData: RecordDataMap[T] | undefined;
  if (patch.data !== undefined) {
    const { data: current, error: readError } = await supabase
      .from('records')
      .select('data')
      .eq('campaign_id', campaignId)
      .eq('id', id)
      .eq('record_type', type)
      .maybeSingle();

    if (readError) return mapPostgrestError(readError);
    if (!current) return notFound();

    mergedData = {
      ...(current.data as RecordDataMap[T]),
      ...patch.data,
    };
  }

  // Build the column-level patch. Only include fields the caller actually
  // specified — undefined keys in the patch must not become `null` writes.
  // `data` / `visibility_overrides` use the loosened write types from
  // `AppDatabase` (the records Row stays on `Json` — see database-overrides).
  const update: {
    name?: string;
    tags?: string[];
    date_encountered?: string | null;
    visibility_overrides?: VisibilityOverrides;
    data?: RecordDataMap[T];
  } = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.date_encountered !== undefined) {
    update.date_encountered = patch.date_encountered;
  }
  if (patch.visibility_overrides !== undefined) {
    update.visibility_overrides = patch.visibility_overrides;
  }
  if (mergedData !== undefined) update.data = mergedData;

  // `record_type` is included as a defensive equality filter, not in the
  // update payload — we never want to change a record's type through this
  // function. Reclassification is a separate flow (design doc §9.5).
  const { data, error } = await supabase
    .from('records')
    .update(update)
    .eq('campaign_id', campaignId)
    .eq('id', id)
    .eq('record_type', type)
    .select('*')
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return notFound();
  return ok(data as RecordTypeMap[T]);
}

/**
 * Soft-delete a record by setting `deleted_at`. Does NOT touch
 * `linked_records` — the FK `on delete cascade` only fires on hard delete,
 * and the data access layer is responsible for treating links to
 * soft-deleted records as inactive at render time (per design doc §6.8).
 *
 * RLS allows GMs only. The returned row is the soft-deleted record.
 */
export async function softDeleteRecord(campaignId: string, id: string): Promise<Result<AnyRecord>> {
  const { data, error } = await supabase
    .from('records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return mapPostgrestError(error);
  if (!data) return notFound();
  return ok(data as AnyRecord);
}

/**
 * List non-deleted records in a campaign, optionally narrowed by type.
 *
 * When `type` is provided, the return type is narrowed to the matching
 * variant array. When omitted, the result is `AnyRecord[]` and callers
 * narrow per-row on `record_type`.
 *
 * Ordering: most-recently-updated first, matching the registry list-view
 * convention. Soft-deleted rows are excluded by the RLS read policy.
 */
export function listRecords<T extends RecordType>(
  campaignId: string,
  type: T,
): Promise<Result<RecordTypeMap[T][]>>;
export function listRecords(campaignId: string): Promise<Result<AnyRecord[]>>;
export async function listRecords<T extends RecordType>(
  campaignId: string,
  type?: T,
): Promise<Result<AnyRecord[] | RecordTypeMap[T][]>> {
  let query = supabase
    .from('records')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (type !== undefined) {
    query = query.eq('record_type', type);
  }

  const { data, error } = await query;

  if (error) return mapPostgrestError(error);
  if (!data) return unknown(new Error('records list returned null data'));
  return ok(data as AnyRecord[]);
}
