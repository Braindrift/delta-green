/**
 * Registry definition for `civilian` records.
 *
 * Low-significance NPCs, bystanders, witnesses.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const civilianDefinition: RecordTypeDefinition<'civilian'> = {
  type: 'civilian',
  label: 'CIV',
  displayName: 'Civilian',
  displayNamePlural: 'Civilians',
  createDefault: () => createDefault('civilian'),
  FormComponent: makePlaceholderForm('civilian'),
  CardComponent: makePlaceholderCard('civilian'),
  ListItemComponent: makePlaceholderListItem('civilian'),
};
