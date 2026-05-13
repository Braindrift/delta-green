/**
 * Registry definition for `unnatural` records.
 *
 * Supernatural / alien / occult entities.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const unnaturalDefinition: RecordTypeDefinition<'unnatural'> = {
  type: 'unnatural',
  label: 'UNT',
  displayName: 'Unnatural',
  displayNamePlural: 'Unnatural Entities',
  createDefault: () => createDefault('unnatural'),
  FormComponent: makePlaceholderForm('unnatural'),
  CardComponent: makePlaceholderCard('unnatural'),
  ListItemComponent: makePlaceholderListItem('unnatural'),
};
