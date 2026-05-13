/**
 * Type definitions for the record type registry.
 *
 * Each of the 12 record types ships a module that conforms to
 * `RecordTypeDefinition<T>`. The registry (`./index.ts`) imports all 12
 * and exposes a typed map keyed by `RecordType`. Adding a new record type
 * is then a two-step operation: write the module, add one import line to
 * the registry.
 *
 * The definition carries metadata (label, display name, prefix, etc.) and
 * three React component slots (form, card, list item). The component slots
 * are typed here but the *concrete* per-type components are placeholders
 * until <issue id="DEL-17">DEL-17</issue> / <issue id="DEL-18">DEL-18</issue>
 * land the form-panel and card shells and DEL-19+ fill in the per-type
 * content. See each per-type module for the placeholder.
 *
 * Per-field SmartRef target rules live on the form component itself, not
 * here. See the design note on this decision in the session handoff.
 */

import type { ComponentType } from 'react';

import type { RecordType, RecordTypeMap } from '@/types/records';

/* -------------------------------------------------------------------------- */
/*  Component prop contracts                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Props the per-type FormComponent receives. The form panel shell (DEL-17)
 * owns chrome (title bar, save/cancel buttons, dirty-state tracking); the
 * per-type component owns field-level rendering.
 *
 * `record` is either an existing row (edit mode) or a fresh
 * `RecordDraft<T>` from `createDefault(type)` (create mode). The component
 * is purely controlled — the shell owns the state, the per-type component
 * fires `onChange` with each user edit.
 */
export type RecordFormProps<T extends RecordType> = {
  /**
   * Current form state. Variant-narrowed to match the type. Holds either
   * a freshly-defaulted draft (create flow) or the row being edited.
   */
  record: RecordFormState<T>;
  /**
   * Called on every field change. Receives a patch shaped like
   * `UpdateRecordPatch<T>` from `@/lib/records`. The form panel shell
   * merges patches into its working copy.
   */
  onChange: (patch: RecordFormPatch<T>) => void;
};

/**
 * The shape passed in via `RecordFormProps.record`. Distinct from a stored
 * `RecordTypeMap[T]` because server-set fields (id, timestamps) may be
 * absent during create.
 */
export type RecordFormState<T extends RecordType> = {
  record_type: T;
  name: string;
  tags: string[];
  date_encountered: string | null;
  visibility_overrides: RecordTypeMap[T]['visibility_overrides'];
  data: RecordTypeMap[T]['data'];
};

/**
 * Patch shape fired by per-type forms via `onChange`. Same as the
 * `UpdateRecordPatch<T>` in `@/lib/records/crud.ts` — but kept structurally
 * separate here to avoid the form layer reaching down into the data layer
 * for a type definition. The two are intentionally identical in shape.
 */
export type RecordFormPatch<T extends RecordType> = {
  name?: string;
  tags?: string[];
  date_encountered?: string | null;
  visibility_overrides?: RecordTypeMap[T]['visibility_overrides'];
  data?: Partial<RecordTypeMap[T]['data']>;
};

/**
 * Props the per-type CardComponent receives. The card shell (DEL-18) owns
 * the outer chrome (close button, expand/collapse animation, polaroid
 * grid), the per-type component owns the dossier body.
 */
export type RecordCardProps<T extends RecordType> = {
  /** The record being viewed. Always a saved row — cards don't render drafts. */
  record: RecordTypeMap[T];
};

/**
 * Props the per-type ListItemComponent receives. The list view owns
 * scrolling and selection state; the per-type component owns row layout.
 *
 * `isSelected` reflects whether this row's card is currently open in the
 * content area (prototype behaviour — opening a card highlights the row).
 */
export type RecordListItemProps<T extends RecordType> = {
  record: RecordTypeMap[T];
  isSelected?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  The definition shape itself                                               */
/* -------------------------------------------------------------------------- */

/**
 * The single, complete description of a record type from the application's
 * point of view. Twelve of these live in the registry — one per type — and
 * all consumers (sidebar, type dropdown, SmartRef target filter, router,
 * form panel, card shell, list view) read from this single source.
 */
export type RecordTypeDefinition<T extends RecordType = RecordType> = {
  /** Discriminator. Matches the database `record_type` column. */
  type: T;

  /**
   * Short label used everywhere a compact identifier is needed: ID chips
   * ("OP-A1B2C3"), the type-stamp on cards, the "+ NEW RECORD" dropdown,
   * the SmartRef result rows. Same string serves as the display-ID prefix —
   * `formatDisplayId(definition.label, record.id)` produces the canonical
   * "OP-A1B2C3" form.
   */
  label: string;

  /** Singular display name. e.g. "Operation", "Person of Interest". */
  displayName: string;

  /** Plural display name. e.g. "Operations", "Persons of Interest". */
  displayNamePlural: string;

  /**
   * Types of records that can hold a SmartRef link *to* this type — i.e.
   * "what types are allowed to link to me?". Used by SmartRef search when
   * filtering candidate targets across the registry. Per-field allow-lists
   * live on the form components themselves; this field exists for the
   * cross-type "who can target me" lookup, not the per-field "what can I
   * accept" lookup.
   *
   * Default behaviour (if omitted) is "any type can link to me." Specify
   * to restrict.
   */
  targetableBy?: readonly RecordType[];

  /**
   * Factory returning a sane default draft for a new record of this type.
   * Already implemented in `@/types/records/defaults.ts` — the registry
   * just re-exposes it on the definition for convenient access via
   * `getRecordTypeDefinition(type).createDefault()`.
   */
  createDefault: () => {
    record_type: T;
    name: string;
    tags: string[];
    date_encountered: string | null;
    visibility_overrides: RecordTypeMap[T]['visibility_overrides'];
    data: RecordTypeMap[T]['data'];
  };

  /* ---------- React component slots ---------- */

  /** Form for create/edit. Placeholder until DEL-19+ fills it in per type. */
  FormComponent: ComponentType<RecordFormProps<T>>;

  /** Expanded "dossier" card view. Placeholder until DEL-19+ fills it in. */
  CardComponent: ComponentType<RecordCardProps<T>>;

  /** Row in the type's list view. Placeholder until DEL-19+ fills it in. */
  ListItemComponent: ComponentType<RecordListItemProps<T>>;
};

/* -------------------------------------------------------------------------- */
/*  Registry map                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The map type for the registry. One entry per `RecordType`. The variance
 * is intentional: indexing the map by a literal type yields the exact
 * variant-narrowed definition.
 */
export type RecordTypeRegistry = {
  [K in RecordType]: RecordTypeDefinition<K>;
};

/**
 * Union of every concrete `RecordTypeDefinition<T>` variant. Used as the
 * element type for heterogeneous arrays (e.g. `recordTypeDefinitions`),
 * because `RecordTypeDefinition<RecordType>` (the default-generic form) is
 * invariant in `T` through the React `ComponentType` slots and won't
 * accept the concrete per-type definitions.
 *
 * Consumers iterating this union narrow on `def.type` to recover the
 * variant. The component slots can't be invoked directly with an
 * arbitrary record — they must be paired with their own variant's record
 * type — but for metadata access (label, displayName, etc.) the union is
 * fine.
 */
export type AnyRecordTypeDefinition = {
  [K in RecordType]: RecordTypeDefinition<K>;
}[RecordType];
