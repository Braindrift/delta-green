/**
 * Player-character row shape.
 *
 * Mirrors the deployed Supabase `player_characters` table
 * (`supabase/migrations/20260516140801_add_player_characters_table.sql`).
 *
 * Distinct from the `agent` record-type under `records` — `player_characters`
 * represents the actual played-by-a-human PCs the owner controls. They exist
 * independently of any single campaign and survive when a campaign ends or
 * the player leaves (`campaign_id` is nullable; soft-delete via `deleted_at`).
 *
 * `data` is the JSONB pocket where Delta Green sheet state (HP/WP/SAN/BP,
 * bonds, motivations, etc.) will live in DEF-2. v1 only uses `data.notes` —
 * a freeform text field captured in the create/edit form.
 */

/**
 * In-game lifecycle status. Owner-controlled and orthogonal to campaign
 * attachment — a `retired` PC can still be `assigned` to a campaign (the
 * Handler keeps reading the row); a `deceased` PC stays attached to the
 * campaign it died in until the owner deletes it. The membership concept
 * ("is this PC currently in a campaign?") lives on [[campaign_status]].
 */
export type PlayerCharacterStatus = 'active' | 'retired' | 'deceased';

/**
 * Campaign-attachment state. Mirrors `campaign_id is not null`: the
 * schema enforces the iff invariant via a check constraint. System-
 * managed by the join / leave / kick flows — the agent-roster create flow
 * starts a PC at `'unassigned'`, the assign-to-campaign dialog promotes
 * it to `'assigned'`, and PC→NPC migration (DEL-63) walks it back.
 */
export type PlayerCharacterCampaignStatus = 'assigned' | 'unassigned';

/**
 * Owner-controllable JSONB pocket. v1 holds only `notes`; DEF-2 will extend
 * this with the full Delta Green stat block. Keep it open-ended on the
 * client (`Record<string, unknown>`) so older clients that don't know about
 * new keys don't lose data on a round-trip update.
 */
export type PlayerCharacterData = {
  notes?: string;
} & Record<string, unknown>;

/** Raw `player_characters` row. */
export type PlayerCharacter = {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  name: string;
  archetype: string | null;
  data: PlayerCharacterData;
  status: PlayerCharacterStatus;
  campaign_status: PlayerCharacterCampaignStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Roster-screen view of a PC. The roster panel groups by `campaign_id is
 * null` vs not, and renders the campaign name on attached rows — so we
 * embed the campaign's `name` (only when attached) via a PostgREST join.
 * `null` when the PC is unassigned.
 */
export type PlayerCharacterWithCampaign = PlayerCharacter & {
  campaign: { id: string; name: string } | null;
};
