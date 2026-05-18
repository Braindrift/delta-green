/**
 * Unit tests for `createCampaign` and `checkCampaignNameAvailable`.
 *
 * Same mocking pattern as `queries.test.ts`: a thenable PostgREST builder
 * with `.single()`/`.maybeSingle()` terminals and `.then(...)` fall-through
 * for awaited chains. `supabase.auth.getSession()` is also mocked so the
 * functions' owner-id lookup resolves deterministically.
 *
 * The RLS path itself is validated via smoke-test SQL against the linked
 * Supabase project — these tests cover the Result-shape contract only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { singleMock, queryMock, getSessionMock } = vi.hoisted(() => ({
  singleMock: vi.fn(),
  queryMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
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
      auth: {
        getSession: getSessionMock,
      },
    },
  };
});

import { checkCampaignNameAvailable, createCampaign } from '@/lib/campaigns';

const USER_ID = '22222222-2222-4222-8222-222222222222';

const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: USER_ID,
  name: 'Operation Black Wire',
  codename: null,
  description: 'A test campaign',
  max_agents: 6,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
  deleted_at: null,
};

function mockSession(userId: string | null) {
  getSessionMock.mockResolvedValueOnce({
    data: { session: userId ? { user: { id: userId } } : null },
  });
}

describe('createCampaign', () => {
  beforeEach(() => {
    singleMock.mockReset();
    queryMock.mockReset();
    getSessionMock.mockReset();
  });

  it('returns ok with the inserted campaign on success', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({ data: SAMPLE_CAMPAIGN, error: null });

    const result = await createCampaign({
      name: SAMPLE_CAMPAIGN.name,
      description: SAMPLE_CAMPAIGN.description,
      max_agents: 6,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(SAMPLE_CAMPAIGN);
    }
  });

  it('returns unknown when no session is hydrated', async () => {
    mockSession(null);

    const result = await createCampaign({
      name: 'X',
      description: null,
      max_agents: 6,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
    // The DB layer must not have been called.
    expect(singleMock).not.toHaveBeenCalled();
  });

  it('maps 23505 (unique violation) to conflict', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key', details: '', hint: '' },
    });

    const result = await createCampaign({
      name: 'Dup',
      description: null,
      max_agents: 6,
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

    const result = await createCampaign({
      name: 'X',
      description: null,
      max_agents: 6,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
    }
  });

  it('maps generic Postgres errors to unknown', async () => {
    mockSession(USER_ID);
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'internal_error', details: '', hint: '' },
    });

    const result = await createCampaign({
      name: 'X',
      description: null,
      max_agents: 6,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

describe('checkCampaignNameAvailable', () => {
  beforeEach(() => {
    singleMock.mockReset();
    queryMock.mockReset();
    getSessionMock.mockReset();
  });

  it('returns ok(true) when no owned campaign has that name', async () => {
    mockSession(USER_ID);
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await checkCampaignNameAvailable('Untaken');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });

  it('returns ok(false) when an owned campaign already has that name', async () => {
    mockSession(USER_ID);
    queryMock.mockResolvedValueOnce({
      data: [{ id: SAMPLE_CAMPAIGN.id }],
      error: null,
    });

    const result = await checkCampaignNameAvailable('Operation Black Wire');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(false);
    }
  });

  it('returns unknown when no session is hydrated', async () => {
    mockSession(null);

    const result = await checkCampaignNameAvailable('X');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('maps generic Postgres errors to unknown', async () => {
    mockSession(USER_ID);
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'internal_error', details: '', hint: '' },
    });

    const result = await checkCampaignNameAvailable('X');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
