/**
 * Unit tests for the magic-link invitation write layer.
 *
 * Same mocking pattern as `src/lib/campaigns/mutations.test.ts`: a thenable
 * PostgREST builder with a `.single()` terminal and `.then(...)` fall-through
 * for awaited chains, plus `supabase.auth.getSession()` for the owner-id
 * lookup. The token RPCs route through a separate `rpcMock`, and the
 * `send-invitation-email` edge function through `functionsInvokeMock`.
 *
 * These cover the Result-shape contract and error mapping only — the RLS and
 * RPC behaviour itself is exercised by smoke tests against the linked
 * Supabase project.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { singleMock, queryMock, getSessionMock, rpcMock, functionsInvokeMock } =
  vi.hoisted(() => ({
    singleMock: vi.fn(),
    queryMock: vi.fn(),
    getSessionMock: vi.fn(),
    rpcMock: vi.fn(),
    functionsInvokeMock: vi.fn(),
  }));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = singleMock;
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(queryMock()).then(resolve, reject);
    return builder;
  }
  return {
    supabase: {
      from: vi.fn(() => makeBuilder()),
      auth: { getSession: getSessionMock },
      rpc: (...args: unknown[]) => Promise.resolve(rpcMock(...args)),
      functions: {
        invoke: (...args: unknown[]) => Promise.resolve(functionsInvokeMock(...args)),
      },
    },
  };
});

import {
  acceptInvitation,
  acceptInvitationWithPc,
  claimInvitationByToken,
  createStrangerInvitation,
  declineInvitation,
  declineInvitationByToken,
  sendInvitationEmail,
} from '@/lib/invitations';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INVITATION_ID = '44444444-4444-4444-8444-444444444444';
const PC_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'tok_abc123';

const INVITATION_ROW = {
  id: INVITATION_ID,
  campaign_id: CAMPAIGN_ID,
  invited_by: USER_ID,
  invitee_user_id: null,
  invitee_email: 'stranger@example.com',
  message: null,
  status: 'pending',
  expires_at: '2099-01-01T00:00:00Z',
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
  queryMock.mockReset();
  getSessionMock.mockReset();
  rpcMock.mockReset();
  functionsInvokeMock.mockReset();
}

/* -------------------------------------------------------------------------- */
/*  createStrangerInvitation                                                  */
/* -------------------------------------------------------------------------- */

describe('createStrangerInvitation', () => {
  beforeEach(resetAll);

  it('returns ok with the inserted invitation and normalises the email', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({ data: INVITATION_ROW, error: null });

    const result = await createStrangerInvitation({
      campaignId: CAMPAIGN_ID,
      inviteeEmail: '  Stranger@Example.com  ',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(INVITATION_ROW);
    }
  });

  it('returns unknown when no session is hydrated', async () => {
    mockSession(null);

    const result = await createStrangerInvitation({
      campaignId: CAMPAIGN_ID,
      inviteeEmail: 'x@example.com',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
    expect(singleMock).not.toHaveBeenCalled();
  });

  it('maps 23505 (partial unique on pending invite) to conflict', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('23505') });

    const result = await createStrangerInvitation({
      campaignId: CAMPAIGN_ID,
      inviteeEmail: 'dup@example.com',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('conflict');
    }
  });

  it('maps 42501 (RLS) to forbidden', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await createStrangerInvitation({
      campaignId: CAMPAIGN_ID,
      inviteeEmail: 'x@example.com',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  claimInvitationByToken                                                    */
/* -------------------------------------------------------------------------- */

describe('claimInvitationByToken', () => {
  beforeEach(resetAll);

  it('returns ok(null) for an empty token without calling the RPC', async () => {
    const result = await claimInvitationByToken('   ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns the claim payload when the RPC matches a row', async () => {
    rpcMock.mockReturnValueOnce({
      data: [{ invitation_id: INVITATION_ID, campaign_id: CAMPAIGN_ID }],
      error: null,
    });

    const result = await claimInvitationByToken(`  ${TOKEN}  `);

    expect(rpcMock).toHaveBeenCalledWith('claim_invitation_by_token', {
      p_token: TOKEN,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        invitation_id: INVITATION_ID,
        campaign_id: CAMPAIGN_ID,
      });
    }
  });

  it('returns ok(null) when the RPC returns no rows', async () => {
    rpcMock.mockReturnValueOnce({ data: [], error: null });

    const result = await claimInvitationByToken(TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('maps an RPC error via mapPostgrestError', async () => {
    rpcMock.mockReturnValueOnce({ data: null, error: pgError('42501') });

    const result = await claimInvitationByToken(TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  declineInvitationByToken                                                  */
/* -------------------------------------------------------------------------- */

describe('declineInvitationByToken', () => {
  beforeEach(resetAll);

  it('returns ok(null) for an empty token without calling the RPC', async () => {
    const result = await declineInvitationByToken('');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns the invitation id when the RPC declines a pending row', async () => {
    rpcMock.mockReturnValueOnce({
      data: [{ invitation_id: INVITATION_ID }],
      error: null,
    });

    const result = await declineInvitationByToken(TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ invitation_id: INVITATION_ID });
    }
  });

  it('returns ok(null) when the row is no longer pending', async () => {
    rpcMock.mockReturnValueOnce({ data: [], error: null });

    const result = await declineInvitationByToken(TOKEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  acceptInvitationWithPc / acceptInvitation                                 */
/* -------------------------------------------------------------------------- */

describe.each([
  ['acceptInvitationWithPc', (id: string) => acceptInvitationWithPc(id, PC_ID)],
  ['acceptInvitation', (id: string) => acceptInvitation(id)],
] as const)('%s', (_name, call) => {
  beforeEach(resetAll);

  it('returns ok with campaign_id on the accepted branch', async () => {
    rpcMock.mockReturnValueOnce({
      data: [{ campaign_id: CAMPAIGN_ID, status: 'accepted' }],
      error: null,
    });

    const result = await call(INVITATION_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ status: 'accepted', campaign_id: CAMPAIGN_ID });
    }
  });

  it.each(['gone', 'deleted', 'full'] as const)(
    'returns ok with null campaign_id on the %s branch',
    async (status) => {
      rpcMock.mockReturnValueOnce({
        data: [{ campaign_id: null, status }],
        error: null,
      });

      const result = await call(INVITATION_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ status, campaign_id: null });
      }
    },
  );

  it('returns unknown when the RPC returns no rows', async () => {
    rpcMock.mockReturnValueOnce({ data: [], error: null });

    const result = await call(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('returns unknown on an unexpected status discriminator', async () => {
    rpcMock.mockReturnValueOnce({
      data: [{ campaign_id: null, status: 'weird' }],
      error: null,
    });

    const result = await call(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('returns unknown when accepted but campaign_id is null', async () => {
    rpcMock.mockReturnValueOnce({
      data: [{ campaign_id: null, status: 'accepted' }],
      error: null,
    });

    const result = await call(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('maps an RPC error via mapPostgrestError', async () => {
    rpcMock.mockReturnValueOnce({ data: null, error: pgError('42501') });

    const result = await call(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  declineInvitation (in-app direct UPDATE)                                  */
/* -------------------------------------------------------------------------- */

describe('declineInvitation', () => {
  beforeEach(resetAll);

  it('returns the matched row count on success', async () => {
    queryMock.mockResolvedValueOnce({ data: [{ id: INVITATION_ID }], error: null });

    const result = await declineInvitation(INVITATION_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ matched: 1 });
    }
  });

  it('returns matched 0 when no pending row matched', async () => {
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await declineInvitation(INVITATION_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ matched: 0 });
    }
  });

  it('maps Postgres errors via mapPostgrestError', async () => {
    queryMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await declineInvitation(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  sendInvitationEmail (edge function)                                       */
/* -------------------------------------------------------------------------- */

/** Build a FunctionsHttpError-like object whose `.context` yields `body`. */
function functionsError(body: unknown, message = 'http error') {
  return {
    message,
    context: { json: () => Promise.resolve(body) },
  };
}

describe('sendInvitationEmail', () => {
  beforeEach(resetAll);

  it('returns ok on a 2xx response', async () => {
    functionsInvokeMock.mockReturnValueOnce({ data: { ok: true }, error: null });

    const result = await sendInvitationEmail(INVITATION_ID);

    expect(result.ok).toBe(true);
  });

  it.each([
    'email_provider_not_configured',
    'app_base_url_not_configured',
  ])('maps %s to the not_configured kind', async (errorCode) => {
    functionsInvokeMock.mockReturnValueOnce({
      data: null,
      error: functionsError({ error: errorCode }),
    });

    const result = await sendInvitationEmail(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_configured');
    }
  });

  it('maps email_provider_failed to provider_failed with the detail', async () => {
    functionsInvokeMock.mockReturnValueOnce({
      data: null,
      error: functionsError({
        error: 'email_provider_failed',
        provider_message: 'unverified sender',
      }),
    });

    const result = await sendInvitationEmail(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('provider_failed');
      expect(result.error.detail).toBe('unverified sender');
    }
  });

  it('falls back to unknown for an unrecognised error body', async () => {
    functionsInvokeMock.mockReturnValueOnce({
      data: null,
      error: functionsError({ error: 'something_else' }, 'boom'),
    });

    const result = await sendInvitationEmail(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
      expect(result.error.detail).toBe('boom');
    }
  });

  it('treats a 2xx body carrying an error field as unknown', async () => {
    functionsInvokeMock.mockReturnValueOnce({
      data: { error: 'late_failure' },
      error: null,
    });

    const result = await sendInvitationEmail(INVITATION_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
      expect(result.error.detail).toBe('late_failure');
    }
  });
});
