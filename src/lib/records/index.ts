/**
 * Public surface for the records data access layer.
 *
 * Consumers should import from `@/lib/records` rather than reaching into
 * the per-module files. The Phase 1 contract is captured here so downstream
 * tickets (DEL-13 type registry, DEL-16 SmartRef, DEL-17 form panel) bind
 * to a stable surface.
 */

export {
  createRecord,
  getRecord,
  listRecords,
  softDeleteRecord,
  updateRecord,
  type CreateRecordInput,
  type UpdateRecordPatch,
} from './crud';

export { getLinkedRecords, linkRecords, unlinkRecords } from './links';

export {
  conflict,
  forbidden,
  mapPostgrestError,
  notFound,
  ok,
  unknown,
  type Err,
  type Ok,
  type Result,
} from './errors';
