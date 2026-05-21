/**
 * Public surface for the player-characters data access layer.
 *
 * Consumers import from `@/lib/player-characters` rather than reaching
 * into the per-module files. Mirrors the `@/lib/campaigns` and
 * `@/lib/members` pattern.
 */

export {
  getPlayerCharacterById,
  listCampaignPcs,
  listJoinablePlayerCharacters,
  listMyPlayerCharacters,
} from './queries';

export {
  assignPlayerCharacterToCampaign,
  createPlayerCharacter,
  migratePlayerCharacterToNpc,
  retirePlayerCharacter,
  updatePlayerCharacter,
  type CreatePlayerCharacterInput,
  type MigratePlayerCharacterResult,
  type UpdatePlayerCharacterInput,
} from './mutations';
