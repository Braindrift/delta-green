/**
 * Registry definition for `asset` records.
 *
 * Physical and abstract resources.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const assetDefinition: RecordTypeDefinition<'asset'> = {
  type: 'asset',
  label: 'AST',
  displayName: 'Asset',
  displayNamePlural: 'Assets',
  createDefault: () => createDefault('asset'),
  FormComponent: makePlaceholderForm('asset'),
  CardComponent: makePlaceholderCard('asset'),
  ListItemComponent: makePlaceholderListItem('asset'),
};
