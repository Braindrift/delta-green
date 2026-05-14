/**
 * Public surface of the photo storage module.
 *
 * Three operations against the private `record-photos` bucket:
 *
 *   uploadPhoto(campaignId, recordId, file, opts?) -> Result<Photo>
 *   deletePhoto(path)                              -> Result<void>
 *   getPhotoUrl(path, ttlSeconds?)                 -> Result<string>
 *
 * Path convention: `{campaign_id}/{record_id}/{uuid}.jpg`. The first segment
 * is what Storage RLS keys off (`(storage.foldername(name))[1]`), so client
 * uploads MUST follow this layout or RLS will reject them.
 *
 * Photos are resized to ≤1200px longest edge and re-encoded as JPEG (q≈0.8)
 * before upload — see `./resize`.
 *
 * Signed URLs are cached client-side per-tab — see `./cache`. The bucket is
 * private, so direct public URLs do not work.
 *
 * This module returns the storage path and a `Photo` metadata object; it
 * does NOT write the `Photo` to the owning record's `data.photos[]` array.
 * The caller composes this with `updateRecord(...)` from `@/lib/records`,
 * since record updates are policy-checked at the records layer and we don't
 * want photo uploads to silently mutate row state from a separate code path.
 */

import { supabase } from '@/lib/supabase';
import type { Photo } from '@/types/records';

import { invalidate, readCache, writeCache } from './cache';
import { mapStorageError, type Result } from './errors';
import { unknown, ok } from '@/lib/records';
import { ImageResizeError, resizeImage } from './resize';

/** The single bucket all record photos live in. Private — RLS-gated. */
const BUCKET = 'record-photos';

/**
 * Default TTL for signed URLs. One hour comfortably covers a long session
 * of looking through one operation without re-signing; short enough that a
 * leaked URL dies before becoming a real privacy issue.
 */
const DEFAULT_SIGNED_URL_TTL_S = 3600;

export type UploadPhotoOptions = {
  /**
   * User-defined photo ID, scoped to the owning record (e.g. `"GIRL"`,
   * `"WAREHOUSE"`). Used by inline `[PHOTO:ID]` tokens in narrative text.
   * Defaults to an empty string — the form UI typically prompts for this
   * post-upload.
   */
  id?: string;
  caption?: string;
  /** Optional session reference, e.g. `"Session 2"`. */
  session?: string;
};

/**
 * Resize + compress + upload a photo, returning the `Photo` metadata object
 * for the caller to splice into the record's `data.photos[]`.
 *
 * The returned `Photo.path` is the canonical reference and the only thing
 * persisted in the record. Signed URLs are derived from the path at render
 * time via `getPhotoUrl`.
 *
 * Failure modes:
 *   - Image decode/encode failure       -> `unknown` (cause: `ImageResizeError`)
 *   - Storage upload rejected by RLS    -> `unknown` (cause: `StorageError`)
 *   - Other storage failure              -> `unknown` (cause: `StorageError`)
 *
 * RLS denials currently land in `unknown` rather than `forbidden` — see
 * `./errors` for the rationale.
 */
export async function uploadPhoto(
  campaignId: string,
  recordId: string,
  file: File,
  opts: UploadPhotoOptions = {},
): Promise<Result<Photo>> {
  let resized;
  try {
    resized = await resizeImage(file);
  } catch (err) {
    if (err instanceof ImageResizeError) return unknown(err);
    return unknown(err instanceof Error ? err : new Error(String(err)));
  }

  const filename = `${crypto.randomUUID()}.${resized.ext}`;
  const path = `${campaignId}/${recordId}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, resized.blob, {
    contentType: 'image/jpeg',
    // No upsert — every upload writes to a fresh UUID path, so collisions
    // can only happen with cryptographically unlikely UUID reuse.
    upsert: false,
    cacheControl: '3600',
  });

  if (error) return mapStorageError(error);

  const photo: Photo = {
    id: opts.id ?? '',
    caption: opts.caption ?? '',
    session: opts.session ?? '',
    path,
    added_at: new Date().toISOString(),
  };

  return ok(photo);
}

/**
 * Remove an object from storage by its `Photo.path`. Invalidates the
 * signed-URL cache for that path.
 *
 * The caller is responsible for removing the corresponding entry from the
 * record's `data.photos[]` array via `updateRecord`. This split is
 * deliberate — see the module header.
 *
 * Not-found is treated as success: a record holding a `Photo` whose object
 * is already gone is a state we want to be able to clean up to, not an
 * error. The records-layer rule that empty results map to `not_found`
 * doesn't apply here because there's no row-level access decision to mask;
 * the path either exists in the bucket or it doesn't.
 */
export async function deletePhoto(path: string): Promise<Result<void>> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  invalidate(path);
  if (error) {
    const mapped = mapStorageError(error);
    if (mapped.ok === false && mapped.kind === 'not_found') return ok(undefined);
    return mapped;
  }
  return ok(undefined);
}

/**
 * Return a short-lived signed URL for `path`, served from cache if a
 * still-fresh one is on hand.
 *
 * The returned URL is safe to set as an `<img src>` value but should NOT be
 * persisted — it embeds a credential in its query string.
 *
 * @param ttlSeconds Lifetime of any newly-signed URL. The cache will treat
 *   an existing URL as fresh until `EXPIRY_SAFETY_MARGIN_S` before its
 *   expiry; tightening `ttlSeconds` below that margin defeats caching for
 *   that call but is otherwise harmless.
 */
export async function getPhotoUrl(
  path: string,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_S,
): Promise<Result<string>> {
  const cached = readCache(path);
  if (cached !== null) return ok(cached);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);

  if (error) return mapStorageError(error);
  if (!data?.signedUrl) {
    return unknown(new Error(`createSignedUrl returned no signedUrl for path: ${path}`));
  }

  writeCache(path, data.signedUrl, ttlSeconds);
  return ok(data.signedUrl);
}
