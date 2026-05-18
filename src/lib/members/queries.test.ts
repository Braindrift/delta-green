/**
 * Unit tests for the members data-access read layer.
 *
 * The Supabase client is mocked at the module boundary, mirroring
 * `src/lib/campaigns/queries.test.ts`. The mock exposes a thenable
 * query builder whose terminal value is supplied per-test via
 * `queryMock`. RPC calls are routed through a separate `rpcMock`.
 *
 * End-to-end RLS behaviour is exercised by smoke tests in the
 * Supabase MCP. These tests focus on the Result-shape contract and
 * the merge logic between the base reads and the profile fan-out.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, rpcMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.gt = vi.fn(() => builder);
    builder.ilike = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(queryMock()).then(resolve, reject);
    return builder;
  }
  return {
    supabase: {
      from: vi.fn(() => makeBuilder()),
      rpc: (...args: unknown[]) => Promise.resolve(rpcMock(...args)),
    },
  };
});

import {
  findUserByEmail,
  listCampaignMembers,
  listPendingInvitations,
  searchUsersByUsername,
} from '@/lib/members';

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';

const MEMBER_ROW = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  campaign_id: CAMPAIGN_ID,
  user_id: USER_A,
  role: 'gm',
  status: 'active',
  left_at: null,
  created_at: '2026-05-17T00:00:00Z',
};

const PROFILE_A = { user_id: USER_A, username: 'erik' };
const PROFILE_B = { user_id: USER_B, username: 'jane' };

const PENDING_USER_INVITE = {
  id: 'pi-1',
  campaign_id: CAMPAIGN_ID,
  invited_by: USER_A,
  invitee_user_id: USER_B,
  invitee_email: null,
  message: null,
  status: 'pending',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2026-05-17T00:00:00Z',
  resolved_at: null,
};

const PENDING_EMAIL_INVITE = {
  id: 'pi-2',
  campaign_id: CAMPAIGN_ID,
  invited_by: USER_A,
  invitee_user_id: null,
  invitee_email: 'stranger@example.test',
  message: null,
  status: 'pending',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2026-05-17T00:00:00Z',
  resolved_at: null,
};

/* -------------------------------------------------------------------------- */
/*  listCampaignMembers                                                       */
/* -------------------------------------------------------------------------- */

describe('listCampaignMembers', () => {
  beforeEach(() => {
    queryMock.mockReset();
    rpcMock.mockReset();
  });

  it('returns members enriched with usernames', async () => {
    queryMock.mockResolvedValueOnce({ data: [MEMBER_ROW], error: null });
    queryMock.mockResolvedValueOnce({ data: [PROFILE_A], error: null });

    const result = await listCampaignMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([{ ...MEMBER_ROW, username: 'erik' }]);
    }
  });

  it('returns an empty array without a second query when no members exist', async () => {
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await listCampaignMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('leaves username null when no profile row matches', async () => {
    queryMock.mockResolvedValueOnce({ data: [MEMBER_ROW], error: null });
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await listCampaignMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].username).toBeNull();
    }
  });

  it('maps a Postgres error on the base read to unknown', async () => {
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom', details: '', hint: '' },
    });

    const result = await listCampaignMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('surfaces a profile-lookup error', async () => {
    queryMock.mockResolvedValueOnce({ data: [MEMBER_ROW], error: null });
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom', details: '', hint: '' },
    });

    const result = await listCampaignMembers(CAMPAIGN_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  listPendingInvitations                                                    */
/* -------------------------------------------------------------------------- */

describe('listPendingInvitations', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('enriches existing-user invites and leaves email invites with null username', async () => {
    queryMock.mockResolvedValueOnce({
      data: [PENDING_USER_INVITE, PENDING_EMAIL_INVITE],
      error: null,
    });
    queryMock.mockResolvedValueOnce({ data: [PROFILE_B], error: null });

    const result = await listPendingInvitations(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        { ...PENDING_USER_INVITE, username: 'jane' },
        { ...PENDING_EMAIL_INVITE, username: null },
      ]);
    }
  });

  it('returns empty without a second query when nothing is pending', async () => {
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await listPendingInvitations(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('skips the profile fan-out when all pending invites are email-only', async () => {
    queryMock.mockResolvedValueOnce({
      data: [PENDING_EMAIL_INVITE],
      error: null,
    });

    const result = await listPendingInvitations(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].username).toBeNull();
    }
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  searchUsersByUsername                                                     */
/* -------------------------------------------------------------------------- */

describe('searchUsersByUsername', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns trimmed-match results', async () => {
    queryMock.mockResolvedValueOnce({
      data: [PROFILE_A, PROFILE_B],
      error: null,
    });

    const result = await searchUsersByUsername('  e');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({ user_id: USER_A, username: 'erik' });
    }
  });

  it('short-circuits on an empty query without hitting the network', async () => {
    const result = await searchUsersByUsername('   ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('maps a Postgres error to unknown', async () => {
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom', details: '', hint: '' },
    });

    const result = await searchUsersByUsername('e');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  findUserByEmail                                                           */
/* -------------------------------------------------------------------------- */

describe('findUserByEmail', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns ok(uuid) when the RPC resolves a user id', async () => {
    rpcMock.mockReturnValueOnce({ data: USER_A, error: null });

    const result = await findUserByEmail('Erik@Example.com');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(USER_A);
    }
    // The RPC must be called with the lowercased, trimmed email.
    expect(rpcMock).toHaveBeenCalledWith('find_user_by_email', {
      p_email: 'erik@example.com',
    });
  });

  it('returns ok(null) when the RPC resolves null', async () => {
    rpcMock.mockReturnValueOnce({ data: null, error: null });

    const result = await findUserByEmail('nobody@example.test');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('short-circuits on an empty input without calling the RPC', async () => {
    const result = await findUserByEmail('   ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps RPC errors to unknown', async () => {
    rpcMock.mockReturnValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom', details: '', hint: '' },
    });

    const result = await findUserByEmail('x@y.test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
