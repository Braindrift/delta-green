/**
 * Registry definition for `poi` records.
 *
 * Person of Interest — plot-relevant NPCs, suspects, cultists.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const poiDefinition: RecordTypeDefinition<'poi'> = {
  type: 'poi',
  label: 'POI',
  displayName: 'Person of Interest',
  displayNamePlural: 'Persons of Interest',
  createDefault: () => createDefault('poi'),
  FormComponent: makePlaceholderForm('poi'),
  CardComponent: makePlaceholderCard('poi'),
  ListItemComponent: makePlaceholderListItem('poi'),
};
