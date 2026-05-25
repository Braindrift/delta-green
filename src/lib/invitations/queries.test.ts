/**
 * Unit tests for the magic-link invitation read layer.
 *
 * `getInvitationByToken` goes through the `get_invitation_by_token` RPC
 * (routed via `rpcMock`). `getInvitationForAccept` does a `.maybeSingle()`
 * base read followed by a profile `.maybeSingle()` + a head-count query in a
 * `Promise.all` fan-out — `maybeSingleMock` serves the two single reads in
 * order and `queryMock` serves the awaited count.
 *
 * Result-shape contract only; RLS/RPC behaviour is covered by smoke tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { maybeSingleMock, queryMock, rpcMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  queryMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = maybeSingleMock;
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

import { getInvitationByToken, getInvitationForAccept } from '@/lib/invitations';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const INVITER_ID = '22222222-2222-4222-8222-222222222222';
const INVITEE_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'tok_abc123';

function pgError(code: string) {
  return { code, message: code, details: '', hint: '' };
}

function resetAll() {
  maybeSingleMock.mockReset();
  queryMock.mockReset();
  rpcMock.mockReset();
}

/* -------------------------------------------------------------------------- */
/*  getInvitationByToken                                                      */
/* -------------------------------------------------------------------------- */

describe('getInvitationByToken', () => {
  beforeEach(resetAll);

  it('returns ok(null) for an empty token without calling the RPC', async () => {
    const result = await getInvitationByToken('   ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps the row to the display payload on a match', async () => {
    const row = {
      campaign_name: 'Operation Black Wire',
      inviter_handle: 'handler',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00Z',
      message: 'Join us',
      invitee_email: 'stranger@example.com',
    };
    rpcMock.mockReturnValueOnce({ data: [row], error: null });

    const result = await getInvitationByToken(`  ${TOKEN}  `);

    expect(rpcMock).toHaveBeenCalledWith('get_invitation_by_token', {
      p_token: TOKEN,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(row);
    }
  });

  it('returns ok(null) when the RPC returns no rows', async () => {
    rpcMock.mockReturnValueOnce({ data: [], error: null });

    const result = await getInvitationByToken(TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('returns unknown on an unrecognised status', async () => {
    rpcMock.mockReturnValueOnce({
      data: [
        {
          campaign_name: 'X',
          inviter_handle: 'h',
          status: 'banished',
          expires_at: '2099-01-01T00:00:00Z',
          message: null,
          invitee_email: 'x@example.com',
        },
      ],
      error: null,
    });

    const result = await getInvitationByToken(TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('maps an RPC error via mapPostgrestError', async () => {
    rpcMock.mockReturnValueOnce({ data: null, error: pgError('XX000') });

    const result = await getInvitationByToken(TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  getInvitationForAccept                                                    */
/* -------------------------------------------------------------------------- */

const ACCEPT_BASE_ROW = {
  id: INVITATION_ID,
  campaign_id: CAMPAIGN_ID,
  invitee_user_id: INVITEE_ID,
  status: 'pending',
  expires_at: '2099-01-01T00:00:00Z',
  message: null,
  invited_by: INVITER_ID,
  campaign: {
    id: CAMPAIGN_ID,
    name: 'Operation Black Wire',
    max_agents: 6,
    deleted_at: null,
  },
};

describe('getInvitationForAccept', () => {
  beforeEach(resetAll);

  it('merges the base read, inviter profile, and member count on success', async () => {
    // 1st maybeSingle: base invitation+campaign read.
    maybeSingleMock.mockResolvedValueOnce({ data: ACCEPT_BASE_ROW, error: null });
    // 2nd maybeSingle: inviter profile (resolved inside Promise.all).
    maybeSingleMock.mockResolvedValueOnce({
      data: { username: 'handler' },
      error: null,
    });
    // Awaited head-count query (also inside Promise.all).
    queryMock.mockResolvedValueOnce({ count: 3, error: null });

    const result = await getInvitationForAccept(INVITATION_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        invitation_id: INVITATION_ID,
        campaign_id: CAMPAIGN_ID,
        campaign_name: 'Operation Black Wire',
        campaign_max_agents: 6,
        campaign_deleted_at: null,
        inviter_username: 'handler',
        status: 'pending',
        expires_at: '2099-01-01T00:00:00Z',
        message: null,
        invitee_user_id: INVITEE_ID,
        active_member_count: 3,
      });
    }
  });

  it('maps a 22P02 (malformed uuid) to not_found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('22P02') });

    const result = await getInvitationForAccept('not-a-uuid');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
    }
  });

  it('returns not_found when no row matches', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await getInvitationForAccept(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
    }
  });

  it('returns unknown on an unrecognised invitation status', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { ...ACCEPT_BASE_ROW, status: 'banished' },
      error: null,
    });

    const result = await getInvitationForAccept(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('surfaces a failure in the profile fan-out', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: ACCEPT_BASE_ROW, error: null });
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });
    queryMock.mockResolvedValueOnce({ count: 0, error: null });

    const result = await getInvitationForAccept(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
