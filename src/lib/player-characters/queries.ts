/**
 * Player-character read queries against the deployed Supabase
 * `player_characters` table.
 *
 * Returns the Result-shape from `@/lib/records/errors` rather than throwing,
 * mirroring `@/lib/campaigns/queries`. RLS narrows the visible set to PCs
 * the caller owns plus PCs attached to campaigns they're a member of
 * (per `20260516140801_add_player_characters_table.sql`).
 *
 * Embedded campaign read: `campaign:campaigns(id, name)` joins through the
 * `campaign_id` foreign key. Soft-deleted campaigns are hidden by the
 * campaigns RLS read policy, so the embed will simply return `null` for
 * attached PCs whose campaign was destroyed — the UI treats this as
 * "unassigned" visually until DEF-2 adds a recovery surface.
 */

import { supabase } from '@/lib/supabase';
import { mapPostgrestError, notFound, ok, unknown, type Result } from '@/lib/records/errors';
import type {
  PlayerCharacter,
  PlayerCharacterWithCampaign,
} from '@/types/player-characters';

const PC_SELECT_WITH_CAMPAIGN =
  'id, owner_id, campaign_id, name, archetype, data, status, campaign_status, created_at, updated_at, deleted_at, campaign:campaigns(id, name)';

/**
 * Fetch every non-deleted PC owned by the authenticated user, with the
 * attached campaign's `name` embedded for the "In campaigns" section.
 *
 * The owner SELECT policy on `player_characters` does NOT filter
 * `deleted_at` (intentionally, to support a future trash/restore flow),
 * so the explicit `is('deleted_at', null)` here is the roster-screen
 * filter — soft-deleted PCs don't appear in the list until a recovery UI
 * lands (deferred to DEF-2).
 *
 * Ordered by `name` ascending for a stable alphabetical roster.
 */
export async function listMyPlayerCharacters(): Promise<
  Result<PlayerCharacterWithCampaign[]>
> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const { data, error } = await supabase
    .from('player_characters')
    .select(PC_SELECT_WITH_CAMPAIGN)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) return mapPostgrestError(error);

  // The typed client infers the campaign embed; normalise the
  // object-or-one-element-array shape PostgREST can return for a to-one
  // relation so consumers see a clean `{ id, name } | null` value.
  return ok(
    (data ?? []).map((row) => ({
      ...row,
      campaign: Array.isArray(row.campaign) ? row.campaign[0] ?? null : row.campaign,
    })),
  );
}

/**
 * Fetch the joinable PC roster: PCs owned by the caller that can be
 * brought into a campaign right now. Filters `campaign_status =
 * 'unassigned'` and `deleted_at is null` — the exact set the DEL-46
 * accept-invite picker offers. (The schema invariant guarantees
 * `campaign_id is null` whenever `campaign_status = 'unassigned'`, so a
 * redundant `is('campaign_id', null)` filter would be a no-op.) Ordered
 * by `name` ascending for roster stability.
 *
 * Returned as the slim `PlayerCharacter` shape (no campaign embed) since
 * the picker only renders the name + archetype + notes — no campaign
 * attachment by construction.
 */
export async function listJoinablePlayerCharacters(): Promise<
  Result<PlayerCharacter[]>
> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    return unknown(new Error('No authenticated session'));
  }

  const { data, error } = await supabase
    .from('player_characters')
    .select(
      'id, owner_id, campaign_id, name, archetype, data, status, campaign_status, created_at, updated_at, deleted_at',
    )
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .eq('campaign_status', 'unassigned')
    .order('name', { ascending: true });

  if (error) return mapPostgrestError(error);
  return ok(data ?? []);
}

/**
 * Fetch the minimal PC roster for a single campaign — just `owner_id` and
 * `name`, for `CampaignInfoPanel` (DEL-70) to merge into the member list.
 * Filters `deleted_at is null`; the campaign's RLS on `player_characters`
 * already restricts visibility to active members of the campaign.
 *
 * Returns the slim `{ owner_id, name }` shape rather than the full PC row
 * because the consumer only needs the name to display next to a member's
 * username. Ordered by `name` ascending for stable display when a single
 * user has multiple PCs in the same campaign (unusual but allowed).
 */
export async function listCampaignPcs(
  campaignId: string,
): Promise<Result<{ owner_id: string; name: string }[]>> {
  const { data, error } = await supabase
    .from('player_characters')
    .select('owner_id, name')
    .eq('campaign_id', campaignId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) return mapPostgrestError(error);
  return ok(data ?? []);
}

/**
 * Fetch a single PC by id. Returns `not_found` when the row doesn't exist
 * or RLS hides it from the caller — these are intentionally
 * indistinguishable for the same information-leak posture as
 * `getCampaignById`. Used by the edit modal to refresh the row after a
 * successful update.
 */
export async function getPlayerCharacterById(
  id: string,
): Promise<Result<PlayerCharacter>> {
  const { data, error } = await supabase
    .from('player_characters')
    .select('id, owner_id, campaign_id, name, archetype, data, status, campaign_status, created_at, updated_at, deleted_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.code === '22P02') return notFound();
    return mapPostgrestError(error);
  }
  if (!data) return notFound();
  return ok(data);
}
