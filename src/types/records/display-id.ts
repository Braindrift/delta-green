/**
 * Display-ID derivation. Records are identified by UUID in the database, in
 * FK references, in `linked_records`, in URLs, and in API calls. The
 * human-readable `OP-A1B2C3` / `AGT-A1B2C3` style is a presentation concern,
 * derived from the UUID at render time. See design doc §6.4.
 *
 * The per-type prefix table lives in the type registry (DEL-13). This module
 * only owns the suffix-derivation primitive and a generic combiner — it
 * stays decoupled from the registry so it can be used (and unit-tested)
 * before DEL-13 lands.
 */

/**
 * Number of hex characters used in the display-ID suffix. The UUID's final
 * group is 12 hex characters, so 6 gives us comfortable headroom while
 * staying short enough to be glanceable in a chip.
 */
const SUFFIX_LENGTH = 6;

/**
 * Derive the short, stable suffix used in display IDs from a record UUID.
 *
 * Returns the final {@link SUFFIX_LENGTH} hex characters of the UUID, upper-cased.
 * Two records in the same campaign collide with probability ≈ N² / 2 × 16^6 —
 * fine for human-facing display where the canonical UUID is always one click
 * away. Not safe for use as a database key.
 *
 * @example
 * deriveDisplayIdSuffix('0a72c2ca-5264-45f1-879b-2a6566f6479a'); // 'F6479A'
 */
export function deriveDisplayIdSuffix(uuid: string): string {
  // Strip dashes and take the last SUFFIX_LENGTH chars. We don't validate
  // the UUID shape — caller is expected to pass a real UUID; nonsense input
  // produces nonsense output. Keep this hot path allocation-light.
  const compact = uuid.replace(/-/g, '');
  return compact.slice(-SUFFIX_LENGTH).toUpperCase();
}

/**
 * Combine a type prefix with a UUID into a display ID.
 *
 * Pure formatting — does not look up the prefix from the type registry. The
 * registry (DEL-13) calls into this with the prefix it owns for each type.
 *
 * @example
 * formatDisplayId('OP', '0a72c2ca-5264-45f1-879b-2a6566f6479a'); // 'OP-F6479A'
 */
export function formatDisplayId(prefix: string, uuid: string): string {
  return `${prefix}-${deriveDisplayIdSuffix(uuid)}`;
}
