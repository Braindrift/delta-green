/**
 * Registry definition for `operation` records.
 *
 * Operations are the top-level case-file unit. Every other record type
 * can be linked to an operation; an operation can be linked back to any
 * type, so `targetableBy` is left unrestricted (defaults to "any").
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const operationDefinition: RecordTypeDefinition<'operation'> = {
  type: 'operation',
  label: 'OP',
  displayName: 'Operation',
  displayNamePlural: 'Operations',
  createDefault: () => createDefault('operation'),
  FormComponent: makePlaceholderForm('operation'),
  CardComponent: makePlaceholderCard('operation'),
  ListItemComponent: makePlaceholderListItem('operation'),
};
