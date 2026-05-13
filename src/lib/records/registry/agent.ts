/**
 * Registry definition for `agent` records.
 *
 * Unified personnel type covering player agents, DG NPC agents, and
 * friendlies (per design doc §6.5). Role-specific fields are handled by
 * the form component at presentation time, not at the type level.
 */

import { createDefault } from '@/types/records';

import { makePlaceholderCard, makePlaceholderForm, makePlaceholderListItem } from './_placeholders';
import type { RecordTypeDefinition } from './types';

export const agentDefinition: RecordTypeDefinition<'agent'> = {
  type: 'agent',
  label: 'AGT',
  displayName: 'Agent',
  displayNamePlural: 'Agents',
  createDefault: () => createDefault('agent'),
  FormComponent: makePlaceholderForm('agent'),
  CardComponent: makePlaceholderCard('agent'),
  ListItemComponent: makePlaceholderListItem('agent'),
};
