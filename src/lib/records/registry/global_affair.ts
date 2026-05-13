/**
 * Registry definition for `global_affair` records.
 *
 * Geopolitical context, campaign backdrop.
 *
 * Note: the prototype's in-memory key was `globalaffair` (one word). The
 * canonical record_type is `global_affair` (underscore), per the deployed
 * schema. Display label keeps the prototype's "GA" prefix.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const globalAffairDefinition: RecordTypeDefinition<'global_affair'> = {
  type: 'global_affair',
  label: 'GA',
  displayName: 'Global Affair',
  displayNamePlural: 'Global Affairs',
  createDefault: () => createDefault('global_affair'),
  FormComponent: makePlaceholderForm('global_affair'),
  CardComponent: makePlaceholderCard('global_affair'),
  ListItemComponent: makePlaceholderListItem('global_affair'),
};
