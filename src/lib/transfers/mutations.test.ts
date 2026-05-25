/**
 * Unit tests for the Handler ownership-transfer write layer (DEL-49).
 *
 * Same mocking pattern as `src/lib/members/mutations.test.ts`: a `.single()`
 * terminal for insert/update returns, `supabase.auth.getSession()` stubbed so
 * `from_user_id` resolves deterministically, and the `accept_handler_transfer`
 * RPC routed through `rpcMock`. RLS behaviour is covered by smoke tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { singleMock, getSessionMock, rpcMock } = vi.hoisted(() => ({
  singleMock: vi.fn(),
  getSessionMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = singleMock;
    return builder;
  }
  return {
    supabase: {
      from: vi.fn(() => makeBuilder()),
      auth: { getSession: getSessionMock },
      rpc: (...args: unknown[]) => Promise.resolve(rpcMock(...args)),
    },
  };
});

import {
  acceptTransfer,
  cancelTransfer,
  createTransfer,
  declineTransfer,
} from '@/lib/transfers';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const FROM_USER = '22222222-2222-4222-8222-222222222222';
const TO_USER = '33333333-3333-4333-8333-333333333333';
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444';

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

function pgError(code: string) {
  return { code, message: code, details: '', hint: '' };
}

function mockSession(userId: string | null) {
  getSessionMock.mockResolvedValueOnce({
    data: { session: userId ? { user: { id: userId } } : null },
  });
}

function resetAll() {
  singleMock.mockReset();
  getSessionMock.mockReset();
  rpcMock.mockReset();
}

/* -------------------------------------------------------------------------- */
/*  createTransfer                                                            */
/* -------------------------------------------------------------------------- */

describe('createTransfer', () => {
  beforeEach(resetAll);

  it('returns ok with the inserted transfer on success', async () => {
    mockSession(FROM_USER);
    singleMock.mockResolvedValueOnce({ data: TRANSFER_ROW, error: null });

    const result = await createTransfer({
      campaignId: CAMPAIGN_ID,
      toUserId: TO_USER,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(TRANSFER_ROW);
    }
  });

  it('returns unknown when no session is hydrated', async () => {
    mockSession(null);

    const result = await createTransfer({
      campaignId: CAMPAIGN_ID,
      toUserId: TO_USER,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
    expect(singleMock).not.toHaveBeenCalled();
  });

  it('maps 23505 (already a pending transfer) to conflict', async () => {
    mockSession(FROM_USER);
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('23505') });

    const result = await createTransfer({
      campaignId: CAMPAIGN_ID,
      toUserId: TO_USER,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('conflict');
    }
  });

  it('maps 42501 (RLS) to forbidden', async () => {
    mockSession(FROM_USER);
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await createTransfer({
      campaignId: CAMPAIGN_ID,
      toUserId: TO_USER,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  cancelTransfer / declineTransfer                                          */
/* -------------------------------------------------------------------------- */

describe.each([
  ['cancelTransfer', cancelTransfer, 'cancelled'],
  ['declineTransfer', declineTransfer, 'declined'],
] as const)('%s', (_name, call, expectedStatus) => {
  beforeEach(resetAll);

  it(`returns the row flipped to ${expectedStatus} on success`, async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...TRANSFER_ROW, status: expectedStatus, resolved_at: '2026-05-18T01:00:00Z' },
      error: null,
    });

    const result = await call(TRANSFER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe(expectedStatus);
      expect(result.data.resolved_at).not.toBeNull();
    }
  });

  it('maps Postgres errors via mapPostgrestError', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await call(TRANSFER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  acceptTransfer                                                            */
/* -------------------------------------------------------------------------- */

describe('acceptTransfer', () => {
  beforeEach(resetAll);

  it.each(['accepted', 'gone', 'not_recipient', 'deleted'] as const)(
    'lifts the %s discriminator into ok',
    async (outcome) => {
      rpcMock.mockReturnValueOnce({ data: outcome, error: null });

      const result = await acceptTransfer(TRANSFER_ID);

      expect(rpcMock).toHaveBeenCalledWith('accept_handler_transfer', {
        p_transfer_id: TRANSFER_ID,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe(outcome);
      }
    },
  );

  it('returns unknown on an unexpected outcome string', async () => {
    rpcMock.mockReturnValueOnce({ data: 'surprise', error: null });

    const result = await acceptTransfer(TRANSFER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('maps an RPC error via mapPostgrestError', async () => {
    rpcMock.mockReturnValueOnce({ data: null, error: pgError('42501') });

    const result = await acceptTransfer(TRANSFER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});
