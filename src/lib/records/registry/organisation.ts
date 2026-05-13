/**
 * Registry definition for `organisation` records.
 *
 * Agencies, corporations, cults, cells.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const organisationDefinition: RecordTypeDefinition<'organisation'> = {
  type: 'organisation',
  label: 'ORG',
  displayName: 'Organisation',
  displayNamePlural: 'Organisations',
  createDefault: () => createDefault('organisation'),
  FormComponent: makePlaceholderForm('organisation'),
  CardComponent: makePlaceholderCard('organisation'),
  ListItemComponent: makePlaceholderListItem('organisation'),
};
