/**
 * Unit tests for the members data-access write layer.
 *
 * Same mocking pattern as `src/lib/campaigns/mutations.test.ts`:
 * `.single()` is the terminal for insert/update returns, and
 * `supabase.auth.getSession()` is stubbed so `invited_by` resolves
 * deterministically. The RLS behaviour itself is covered by smoke tests
 * via the Supabase MCP.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { singleMock, getSessionMock } = vi.hoisted(() => ({
  singleMock: vi.fn(),
  getSessionMock: vi.fn(),
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
      auth: {
        getSession: getSessionMock,
      },
    },
  };
});

import { inviteExistingUser, kickMember, revokeInvitation } from '@/lib/members';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INVITEE_ID = '33333333-3333-4333-8333-333333333333';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const MEMBER_ID = '55555555-5555-4555-8555-555555555555';

const INVITATION_ROW = {
  id: INVITATION_ID,
  campaign_id: CAMPAIGN_ID,
  invited_by: USER_ID,
  invitee_user_id: INVITEE_ID,
  invitee_email: null,
  message: null,
  status: 'pending',
  expires_at: '2099-01-01T00:00:00Z',
  created_at: '2026-05-18T00:00:00Z',
  resolved_at: null,
};

const MEMBER_ROW = {
  id: MEMBER_ID,
  campaign_id: CAMPAIGN_ID,
  user_id: INVITEE_ID,
  role: 'player',
  status: 'former',
  left_at: '2026-05-18T00:00:00Z',
  created_at: '2026-05-17T00:00:00Z',
};

function mockSession(userId: string | null) {
  getSessionMock.mockResolvedValueOnce({
    data: { session: userId ? { user: { id: userId } } : null },
  });
}

/* -------------------------------------------------------------------------- */
/*  inviteExistingUser                                                        */
/* -------------------------------------------------------------------------- */

describe('inviteExistingUser', () => {
  beforeEach(() => {
    singleMock.mockReset();
    getSessionMock.mockReset();
  });

  it('returns ok with the inserted invitation on success', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({ data: INVITATION_ROW, error: null });

    const result = await inviteExistingUser({
      campaignId: CAMPAIGN_ID,
      inviteeUserId: INVITEE_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(INVITATION_ROW);
    }
  });

  it('returns unknown when no session is hydrated', async () => {
    mockSession(null);

    const result = await inviteExistingUser({
      campaignId: CAMPAIGN_ID,
      inviteeUserId: INVITEE_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
    expect(singleMock).not.toHaveBeenCalled();
  });

  it('maps 23505 (partial unique on pending invite) to conflict', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate', details: '', hint: '' },
    });

    const result = await inviteExistingUser({
      campaignId: CAMPAIGN_ID,
      inviteeUserId: INVITEE_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('conflict');
    }
  });

  it('maps 42501 (RLS) to forbidden', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'rls', details: '', hint: '' },
    });

    const result = await inviteExistingUser({
      campaignId: CAMPAIGN_ID,
      inviteeUserId: INVITEE_ID,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  revokeInvitation                                                          */
/* -------------------------------------------------------------------------- */

describe('revokeInvitation', () => {
  beforeEach(() => {
    singleMock.mockReset();
  });

  it('returns the updated invitation row on success', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...INVITATION_ROW, status: 'revoked', resolved_at: '2026-05-18T01:00:00Z' },
      error: null,
    });

    const result = await revokeInvitation(INVITATION_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('revoked');
    }
  });

  it('maps Postgres errors via mapPostgrestError', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'rls', details: '', hint: '' },
    });

    const result = await revokeInvitation(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  kickMember                                                                */
/* -------------------------------------------------------------------------- */

describe('kickMember', () => {
  beforeEach(() => {
    singleMock.mockReset();
  });

  it('returns the updated member row on success', async () => {
    singleMock.mockResolvedValueOnce({ data: MEMBER_ROW, error: null });

    const result = await kickMember(MEMBER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('former');
      expect(result.data.left_at).not.toBeNull();
    }
  });

  it('maps generic Postgres errors to unknown', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'boom', details: '', hint: '' },
    });

    const result = await kickMember(MEMBER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
