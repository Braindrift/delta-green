/**
 * Registry definition for `artifact` records.
 *
 * Evidence, recovered items, unnatural objects. Distinct from `asset`
 * because artifacts carry chain-of-custody and recovery semantics.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const artifactDefinition: RecordTypeDefinition<'artifact'> = {
  type: 'artifact',
  label: 'ART',
  displayName: 'Artifact',
  displayNamePlural: 'Artifacts',
  createDefault: () => createDefault('artifact'),
  FormComponent: makePlaceholderForm('artifact'),
  CardComponent: makePlaceholderCard('artifact'),
  ListItemComponent: makePlaceholderListItem('artifact'),
};
