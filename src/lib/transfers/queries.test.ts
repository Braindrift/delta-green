/**
 * Unit tests for the Handler ownership-transfer read layer (DEL-49).
 *
 * `listActiveNonHandlerMembers` delegates to `@/lib/members.listCampaignMembers`
 * and filters in-memory — that module is mocked so the filter/sort logic can
 * be exercised against fixed input. `getPendingTransferForCampaign` and
 * `getTransferForRecipient` use the Supabase client directly, terminating in
 * `.maybeSingle()` reads served by `maybeSingleMock` in call order.
 *
 * Result-shape contract only; RLS behaviour is covered by smoke tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok, unknown } from '@/lib/records/errors';
import type { CampaignMemberWithProfile } from '@/types/members';

const { maybeSingleMock, listCampaignMembersMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  listCampaignMembersMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.maybeSingle = maybeSingleMock;
    return builder;
  }
  return {
    supabase: { from: vi.fn(() => makeBuilder()) },
  };
});

vi.mock('@/lib/members', () => ({
  listCampaignMembers: listCampaignMembersMock,
}));

import {
  getPendingTransferForCampaign,
  getTransferForRecipient,
  listActiveNonHandlerMembers,
} from '@/lib/transfers';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const FROM_USER = '22222222-2222-4222-8222-222222222222';
const TO_USER = '33333333-3333-4333-8333-333333333333';
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444';

function pgError(code: string) {
  return { code, message: code, details: '', hint: '' };
}

function member(
  overrides: Partial<CampaignMemberWithProfile>,
): CampaignMemberWithProfile {
  return {
    id: crypto.randomUUID(),
    campaign_id: CAMPAIGN_ID,
    user_id: crypto.randomUUID(),
    role: 'player',
    status: 'active',
    left_at: null,
    created_at: '2026-05-18T00:00:00Z',
    username: 'agent',
    ...overrides,
  };
}

const TRANSFER_ROW = {
  id: TRANSFER_ID,
  campaign_id: CAMPAIGN_ID,
  from_user_id: FROM_USER,
  to_user_id: TO_USER,
  status: 'pending',
  message: null,
  created_at: '2026-05-18T00:00:00Z',
  resolved_at: null,
};

function resetAll() {
  maybeSingleMock.mockReset();
  listCampaignMembersMock.mockReset();
}

/* -------------------------------------------------------------------------- */
/*  listActiveNonHandlerMembers                                               */
/* -------------------------------------------------------------------------- */

describe('listActiveNonHandlerMembers', () => {
  beforeEach(resetAll);

  it('keeps only active players, sorted by username', async () => {
    listCampaignMembersMock.mockResolvedValueOnce(
      ok([
        member({ role: 'gm', username: 'handler' }),
        member({ role: 'player', status: 'former', username: 'ex' }),
        member({ role: 'player', username: 'zara' }),
        member({ role: 'player', username: 'alice' }),
      ]),
    );

    const result = await listActiveNonHandlerMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((m) => m.username)).toEqual(['alice', 'zara']);
    }
  });

  it('passes through an error from listCampaignMembers', async () => {
    listCampaignMembersMock.mockResolvedValueOnce(unknown(new Error('boom')));

    const result = await listActiveNonHandlerMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  getPendingTransferForCampaign                                             */
/* -------------------------------------------------------------------------- */

describe('getPendingTransferForCampaign', () => {
  beforeEach(resetAll);

  it('returns ok(null) when no pending transfer exists', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await getPendingTransferForCampaign(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('returns the pending transfer with the recipient username merged in', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: TRANSFER_ROW, error: null });
    maybeSingleMock.mockResolvedValueOnce({ data: { username: 'zara' }, error: null });

    const result = await getPendingTransferForCampaign(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ...TRANSFER_ROW, to_username: 'zara' });
    }
  });

  it('maps a base-read error via mapPostgrestError', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await getPendingTransferForCampaign(CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  getTransferForRecipient                                                   */
/* -------------------------------------------------------------------------- */

describe('getTransferForRecipient', () => {
  beforeEach(resetAll);

  it('merges the transfer row, campaign name, and sender handle', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: TRANSFER_ROW, error: null });
    maybeSingleMock.mockResolvedValueOnce({
      data: { name: 'Operation Black Wire' },
      error: null,
    });
    maybeSingleMock.mockResolvedValueOnce({ data: { username: 'handler' }, error: null });

    const result = await getTransferForRecipient(TRANSFER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        ...TRANSFER_ROW,
        campaign_name: 'Operation Black Wire',
        from_username: 'handler',
      });
    }
  });

  it('returns not_found when the row is invisible to the caller', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await getTransferForRecipient(TRANSFER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
    }
  });

  it('falls back to an empty campaign name when the campaign is soft-deleted', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: TRANSFER_ROW, error: null });
    // `is('deleted_at', null)` filters out the soft-deleted campaign → null.
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    maybeSingleMock.mockResolvedValueOnce({ data: { username: 'handler' }, error: null });

    const result = await getTransferForRecipient(TRANSFER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.campaign_name).toBe('');
      expect(result.data.from_username).toBe('handler');
    }
  });

  it('maps a base-read error via mapPostgrestError', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await getTransferForRecipient(TRANSFER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
