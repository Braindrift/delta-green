/**
 * Registry definition for `location` records.
 *
 * Sites of significance. Map fields will be added by DEL-23.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const locationDefinition: RecordTypeDefinition<'location'> = {
  type: 'location',
  label: 'LOC',
  displayName: 'Location',
  displayNamePlural: 'Locations',
  createDefault: () => createDefault('location'),
  FormComponent: makePlaceholderForm('location'),
  CardComponent: makePlaceholderCard('location'),
  ListItemComponent: makePlaceholderListItem('location'),
};
