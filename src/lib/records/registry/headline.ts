/**
 * Registry definition for `headline` records.
 *
 * Press coverage, world-building. Note: the `name` column holds the
 * headline text itself for these records.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const headlineDefinition: RecordTypeDefinition<'headline'> = {
  type: 'headline',
  label: 'HDL',
  displayName: 'Headline',
  displayNamePlural: 'Headlines',
  createDefault: () => createDefault('headline'),
  FormComponent: makePlaceholderForm('headline'),
  CardComponent: makePlaceholderCard('headline'),
  ListItemComponent: makePlaceholderListItem('headline'),
};
