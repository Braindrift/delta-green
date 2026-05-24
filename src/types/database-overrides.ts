/**
 * App-level narrowing layer over the generated `Database` type (DEL-92).
 *
 * `npx supabase gen types` emits CHECK-constraint text columns (`role`,
 * `status`, `kind`, `campaign_status`) as plain `string` and JSONB columns as
 * `Json`, because those constraints aren't Postgres ENUM/composite types it
 * can introspect. The app, however, treats them as closed literal unions and
 * refined JSON shapes (so the inbox can switch over `kind`, the roster can
 * discriminate `campaign_status`, etc.).
 *
 * This file re-states only those columns, leaving everything else to flow
 * through from the generated row. Parameterising the Supabase client with
 * `AppDatabase` instead of the raw `Database` means `.from(...).select(...)`
 * reads come back already narrowed — so the data layer needs no per-call
 * `as Campaign` / `as CampaignMember` / ... casts at the PostgREST boundary.
 *
 * `src/types/database.ts` stays a pristine `gen types` artifact: regenerate it
 * after a schema change and this override re-applies on top. If a narrowed
 * column is renamed/dropped, the `Tbls[...]['Row']` reference below stops
 * compiling — a deliberate drift tripwire.
 */
import type { Database } from '@/types/database';
import type {
  CampaignMemberRole,
  CampaignMemberStatus,
  CampaignInvitationStatus,
} from '@/types/members';
import type { CampaignTransferStatus } from '@/types/transfers';
import type {
  PlayerCharacterStatus,
  PlayerCharacterCampaignStatus,
  PlayerCharacterData,
} from '@/types/player-characters';
import type { NotificationKind } from '@/types/notifications';

/** Replace the keys of `T` that appear in `R` with `R`'s versions. */
type Replace<T, R> = Omit<T, keyof R> & R;

type Tbls = Database['public']['Tables'];

/** A generated table entry (`{ Row; Insert; Update; Relationships }`) with its
 *  `Row` columns narrowed. Insert/Update keep the generated `string` types —
 *  writes pass string literals, which satisfy them without extra friction. */
type NarrowRow<TableName extends keyof Tbls, RowOverride> = Replace<
  Tbls[TableName],
  { Row: Replace<Tbls[TableName]['Row'], RowOverride> }
>;

/** `player_characters` needs its `data` JSONB refined on Row *and* the write
 *  paths: the app reads/writes a `PlayerCharacterData` object, which isn't
 *  structurally assignable to the generated `Json`. `status` / `campaign_status`
 *  are narrowed on the Row only — writes pass string literals that satisfy the
 *  generated `string`. */
type PlayerCharactersOverride = Replace<
  Tbls['player_characters'],
  {
    Row: Replace<
      Tbls['player_characters']['Row'],
      {
        status: PlayerCharacterStatus;
        campaign_status: PlayerCharacterCampaignStatus;
        data: PlayerCharacterData;
      }
    >;
    Insert: Replace<Tbls['player_characters']['Insert'], { data?: PlayerCharacterData }>;
    Update: Replace<Tbls['player_characters']['Update'], { data?: PlayerCharacterData }>;
  }
>;

/**
 * `records` write-side bridge (DEL-92, partial). The `records` data layer is a
 * generic, record-type-discriminated system: `data` is a union of 12 shapes
 * (some, e.g. `OperationData.conspiracy_board`, aren't structurally `Json`) and
 * `visibility_overrides` is its own map type. Fully typing that surface — and
 * the dual-FK `linked_records` self-embed in `links.ts` — is its own follow-up.
 *
 * For now we keep the `records` Row on the generated `Json` (the data layer's
 * existing `as RecordTypeMap[T]` / `as AnyRecord` read casts stay, narrowing the
 * union from `Json`) and only loosen the *write* columns so typed inserts /
 * updates of app-shaped record data compile. The follow-up can tighten these.
 */
type RecordsOverride = Replace<
  Tbls['records'],
  {
    Insert: Replace<
      Tbls['records']['Insert'],
      { data?: Record<string, unknown>; visibility_overrides?: Record<string, unknown> }
    >;
    Update: Replace<
      Tbls['records']['Update'],
      { data?: Record<string, unknown>; visibility_overrides?: Record<string, unknown> }
    >;
  }
>;

export type AppDatabase = Replace<
  Database,
  {
    public: Replace<
      Database['public'],
      {
        Tables: Replace<
          Tbls,
          {
            campaign_members: NarrowRow<
              'campaign_members',
              { role: CampaignMemberRole; status: CampaignMemberStatus }
            >;
            campaign_invitations: NarrowRow<
              'campaign_invitations',
              { status: CampaignInvitationStatus }
            >;
            campaign_transfers: NarrowRow<
              'campaign_transfers',
              { status: CampaignTransferStatus }
            >;
            player_characters: PlayerCharactersOverride;
            notifications: NarrowRow<'notifications', { kind: NotificationKind }>;
            records: RecordsOverride;
          }
        >;
      }
    >;
  }
>;
