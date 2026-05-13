/**
 * Registry definition for `incident` records.
 *
 * Discrete supernatural events.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const incidentDefinition: RecordTypeDefinition<'incident'> = {
  type: 'incident',
  label: 'INC',
  displayName: 'Incident',
  displayNamePlural: 'Incidents',
  createDefault: () => createDefault('incident'),
  FormComponent: makePlaceholderForm('incident'),
  CardComponent: makePlaceholderCard('incident'),
  ListItemComponent: makePlaceholderListItem('incident'),
};
