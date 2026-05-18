/**
 * Player-character write operations against the deployed Supabase
 * `player_characters` table.
 *
 * Mirrors `@/lib/campaigns/mutations`: Result-returning, shared PostgREST
 * error mapping, no throws. RLS does the heavy lifting — the owner policies
 * in `20260516140801_add_player_characters_table.sql` gate every mutation
 * to `owner_id = auth.uid()`.
 *
 * Status transitions enforced client-side (the DB only validates the
 * status enum, not the transition graph):
 *   - Create: always `status = 'unassigned'`, `campaign_id = null`.
 *   - Retire: any status → `'retired'`. `campaign_id` is preserved so the
 *     campaign Handler can still see the retired PC under its old
 *     attachment until DEF-2 adds a sheet view.
 *   - Soft-delete: only allowed when `status = 'unassigned'`. PCs attached
 *     to a campaign must be retired (not deleted) so the campaign history
 *     stays intact. The caller (`/agents` page) hides the Delete affordance
 *     for non-unassigned rows; this function is the second line of
 *     defence — it pre-fetches the row and rejects the delete locally if
 *     the status doesn't match.
 *
 * `active` and `former` are reserved for the join/leave/kick flows and are
 * not reachable from this file.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, ok, unknown, type Result } from '@/lib/records/errors';
import type {
  PlayerCharacter,
  PlayerCharacterData,
} from '@/types/player-characters';

/* -------------------------------------------------------------------------- */
/*  Create                                                                    */
/* -------------------------------------------------------------------------- */

export type CreatePlayerCharacterInput = {
  name: string;
  archetype?: string | null;
  notes?: string | null;
};

/**
 * Insert a PC owned by the authenticated user. `owner_id` is taken from
 * the active Supabase session so callers cannot forge it; `campaign_id`
 * is forced to `null` (PCs always start in the owner's roster).
 *
 * `notes` is folded into the `data` JSONB pocket — the schema reserves the
 * top-level columns for stable fields, and DEF-2 will add bonds /
 * motivations / disorders / stats alongside `notes` inside `data`.
 */
export async function createPlayerCharacter(
  input: CreatePlayerCharacterInput,
): Promise<Result<PlayerCharacter>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const data: PlayerCharacterData = {};
  const notes = input.notes?.trim();
  if (notes) data.notes = notes;

  const row = {
    owner_id: userId,
    campaign_id: null,
    name: input.name,
    archetype: input.archetype?.trim() ? input.archetype.trim() : null,
    data,
    status: 'unassigned' as const,
  };

  const { data: inserted, error } = await supabase
    .from('player_characters')
    .insert(row)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(inserted as PlayerCharacter);
}

/* -------------------------------------------------------------------------- */
/*  Update (name / archetype / notes)                                         */
/* -------------------------------------------------------------------------- */

export type UpdatePlayerCharacterInput = {
  name?: string;
  archetype?: string | null;
  notes?: string | null;
};

/**
 * Patch the owner-editable fields on a PC. Empty patches are a no-op (we
 * fast-return the current row).
 *
 * `notes` is a `data.notes` mutation — we do a read-modify-write to preserve
 * any other keys DEF-2 may add. The race window (another tab edits between
 * read and write) is acceptable for v1; DEF-2's stat sheet will switch to a
 * server-side JSON merge RPC.
 */
export async function updatePlayerCharacter(
  id: string,
  input: UpdatePlayerCharacterInput,
): Promise<Result<PlayerCharacter>> {
  const hasName = input.name !== undefined;
  const hasArchetype = input.archetype !== undefined;
  const hasNotes = input.notes !== undefined;

  if (!hasName && !hasArchetype && !hasNotes) {
    // Nothing to write — refetch current and return.
    const { data, error } = await supabase
      .from('player_characters')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return mapPostgrestError(error);
    return ok(data as PlayerCharacter);
  }

  // Read current `data` for the JSONB merge. We only need this if the patch
  // touches notes; for column-only patches the second fetch is skipped.
  let nextData: PlayerCharacterData | undefined;
  if (hasNotes) {
    const { data: current, error: readErr } = await supabase
      .from('player_characters')
      .select('data')
      .eq('id', id)
      .single();
    if (readErr) return mapPostgrestError(readErr);

    const currentData = ((current as { data: PlayerCharacterData | null } | null)?.data ??
      {}) as PlayerCharacterData;
    const trimmed = input.notes?.trim();
    nextData = { ...currentData };
    if (trimmed) {
      nextData.notes = trimmed;
    } else {
      delete nextData.notes;
    }
  }

  const patch: Record<string, unknown> = {};
  if (hasName) patch.name = input.name;
  if (hasArchetype) {
    const trimmed = input.archetype?.trim();
    patch.archetype = trimmed ? trimmed : null;
  }
  if (nextData !== undefined) patch.data = nextData;

  const { data, error } = await supabase
    .from('player_characters')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as PlayerCharacter);
}

/* -------------------------------------------------------------------------- */
/*  Retire                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Set `status = 'retired'`. Preserves `campaign_id` so a retired PC stays
 * visible to its old campaign's Handler. Reachable from any status — the
 * UI only exposes it from `unassigned` / `active` rows in v1.
 */
export async function retirePlayerCharacter(
  id: string,
): Promise<Result<PlayerCharacter>> {
  const { data, error } = await supabase
    .from('player_characters')
    .update({ status: 'retired' })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as PlayerCharacter);
}

/* -------------------------------------------------------------------------- */
/*  Soft-delete                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Soft-delete a PC by stamping `deleted_at`. The "unassigned-only" rule
 * lives in the UI (the `/agents` row disables Delete for any non-unassigned
 * PC and routes the owner to Retire instead) — RLS only checks ownership,
 * not status, and we deliberately don't duplicate the guard here so the
 * mutation surface stays small and total.
 */
export async function softDeletePlayerCharacter(
  id: string,
): Promise<Result<PlayerCharacter>> {
  const { data, error } = await supabase
    .from('player_characters')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return mapPostgrestError(error);
  return ok(data as PlayerCharacter);
}
