/**
 * Public surface for the photo storage module.
 *
 * Consumers should import from `@/lib/photos` rather than reaching into the
 * per-module files. Mirrors the convention established by `@/lib/records`
 * and `@/lib/records/registry`.
 *
 * Phase 2 contract (DEL-12):
 *   - `uploadPhoto`  — resize + compress + upload, returns a `Photo`
 *   - `deletePhoto`  — remove from storage, invalidates the URL cache
 *   - `getPhotoUrl`  — signed URL with client-side caching
 *
 * The records-layer `Result` type is re-exported so a single import covers
 * both call sites.
 */

export { deletePhoto, getPhotoUrl, uploadPhoto, type UploadPhotoOptions } from './storage';

export { type Result } from './errors';
