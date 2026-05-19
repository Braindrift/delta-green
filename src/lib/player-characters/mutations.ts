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
 *   - Create: always `status = 'active'`, `campaign_status = 'unassigned'`,
 *     `campaign_id = null`. After DEL-62 `status` is the pure in-game
 *     lifecycle column; membership lives on `campaign_status`.
 *   - Retire: any status → `'retired'`. `campaign_id` /
 *     `campaign_status` are preserved so the campaign Handler can still
 *     see the retired PC under its old attachment until DEF-2 adds a
 *     sheet view.
 *   - Delete (DEL-63): unified PC → NPC migration via the
 *     `delete_pc_to_npc` RPC. For unassigned PCs it's a hard delete; for
 *     campaign-attached PCs the row is hard-deleted from the roster and
 *     an NPC `agent` record is created in the campaign under Handler
 *     control. Atomic — the RPC runs both writes plus the Handler
 *     notification in a single transaction.
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
    status: 'active' as const,
    campaign_status: 'unassigned' as const,
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
/*  PC → NPC migration (delete from roster)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Result of a `delete_pc_to_npc` RPC call.
 *
 * `npcRecordId` is the id of the new NPC `agent` record in `records` when
 * the deleted PC was campaign-attached; `null` when the PC was
 * unassigned (nothing to migrate — pure roster delete).
 */
export type MigratePlayerCharacterResult = { npcRecordId: string | null };

/**
 * Delete a PC from the owner's roster. The DB-side `delete_pc_to_npc`
 * RPC owns the full sequence:
 *
 *   - Unassigned PC: hard-delete only.
 *   - Campaign-attached PC: insert an NPC `agent` record into the
 *     campaign's `records`, hard-delete the PC row, fire a `pc_detached`
 *     notification on every active Handler of the campaign.
 *
 * All three writes land in the RPC's transaction; partial failures roll
 * back. The RPC also re-checks `auth.uid() = pc.owner_id` server-side and
 * raises if violated — RLS would block a cross-owner update on
 * `player_characters` anyway, but the explicit guard belongs in the
 * security-definer function too.
 */
export async function migratePlayerCharacterToNpc(
  id: string,
): Promise<Result<MigratePlayerCharacterResult>> {
  const { data, error } = await supabase.rpc('delete_pc_to_npc', {
    p_pc_id: id,
  });

  if (error) return mapPostgrestError(error);
  return ok({ npcRecordId: (data as string | null) ?? null });
}
