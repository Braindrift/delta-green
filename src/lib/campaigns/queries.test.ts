/**
 * Unit tests for `getCampaignById`.
 *
 * Covers the Result-shape contract: data found → ok, RLS-hidden / missing →
 * not_found, malformed UUID (Postgres 22P02) → not_found, generic Postgres
 * error → unknown.
 *
 * The Supabase client is mocked at the module boundary so these tests don't
 * touch the network. The RLS behaviour itself is validated end-to-end by
 * `scripts/smoke-test-del-38.ts` — that's the layer that catches a real
 * policy mistake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Supabase client BEFORE importing the SUT. The mock exposes a
// thenable query-builder that supports two terminal shapes:
//
//   - `.from(...).select(...).eq(...).is(...).maybeSingle()` — resolves via
//     `maybeSingleMock` (used by `getCampaignById`).
//   - `.from(...).select(...).eq(...).in(...).is(...).order(...)` awaited
//     directly — resolves via `queryMock`, whose return value is what an
//     `await supabase.from(...)...` would normally produce (`{ data, error }`).
//
// Each test sets up the next resolved value with `mockResolvedValueOnce`.
// `listMyMemberships` makes two queries when memberships exist (the join
// + the member-count tally), so those tests queue two values.
//
// `vi.mock` is hoisted by Vitest above all top-level `const`/`import` statements,
// which means a plain `const maybeSingleMock = vi.fn()` declared above the
// factory is undefined at the moment the factory runs. `vi.hoisted` is the
// supported way to make a variable available inside the hoisted factory —
// it lifts the declaration up alongside the `vi.mock` call.
const { maybeSingleMock, queryMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
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
    },
  };
});

import {
  getCampaignById,
  getMemberCountsByCampaign,
  listMyMemberships,
} from '@/lib/campaigns';

const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '22222222-2222-4222-8222-222222222222',
  name: 'Operation Black Wire',
  codename: 'BLACK WIRE',
  description: null,
  max_agents: 6,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

describe('getCampaignById', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    queryMock.mockReset();
  });

  it('returns ok with the campaign when the row exists', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: SAMPLE_CAMPAIGN, error: null });

    const result = await getCampaignById(SAMPLE_CAMPAIGN.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(SAMPLE_CAMPAIGN);
    }
  });

  it('returns not_found when the row is missing or RLS-hidden', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await getCampaignById(SAMPLE_CAMPAIGN.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
    }
  });

  it('maps Postgres 22P02 (invalid UUID) to not_found', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '22P02',
        message: 'invalid input syntax for type uuid',
        details: '',
        hint: '',
      },
    });

    const result = await getCampaignById('not-a-uuid');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('not_found');
    }
  });

  it('maps an unknown Postgres error to unknown', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'XX000',
        message: 'internal_error',
        details: '',
        hint: '',
      },
    });

    const result = await getCampaignById(SAMPLE_CAMPAIGN.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

const SAMPLE_CAMPAIGN_A = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  owner_id: '22222222-2222-4222-8222-222222222222',
  name: 'Operation Alpha',
  codename: 'ALPHA',
  description: null,
  max_agents: 6,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

const SAMPLE_CAMPAIGN_B = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  owner_id: '33333333-3333-4333-8333-333333333333',
  name: 'Operation Bravo',
  codename: null,
  description: null,
  max_agents: 6,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
  deleted_at: null,
};

describe('listMyMemberships', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    queryMock.mockReset();
  });

  it('returns memberships joined with campaigns and merged member counts', async () => {
    // 1st query: campaign_members rows with embedded campaign.
    queryMock.mockResolvedValueOnce({
      data: [
        { role: 'gm', campaign: SAMPLE_CAMPAIGN_A },
        { role: 'player', campaign: SAMPLE_CAMPAIGN_B },
      ],
      error: null,
    });
    // 2nd query: the tally rows used by getMemberCountsByCampaign.
    queryMock.mockResolvedValueOnce({
      data: [
        { campaign_id: SAMPLE_CAMPAIGN_A.id },
        { campaign_id: SAMPLE_CAMPAIGN_A.id },
        { campaign_id: SAMPLE_CAMPAIGN_B.id },
      ],
      error: null,
    });

    const result = await listMyMemberships();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        { role: 'gm', campaign: SAMPLE_CAMPAIGN_A, member_count: 2 },
        { role: 'player', campaign: SAMPLE_CAMPAIGN_B, member_count: 1 },
      ]);
    }
  });

  it('unwraps the campaign when PostgREST returns it as a single-element array', async () => {
    queryMock.mockResolvedValueOnce({
      data: [{ role: 'gm', campaign: [SAMPLE_CAMPAIGN_A] }],
      error: null,
    });
    queryMock.mockResolvedValueOnce({
      data: [{ campaign_id: SAMPLE_CAMPAIGN_A.id }],
      error: null,
    });

    const result = await listMyMemberships();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].campaign).toEqual(SAMPLE_CAMPAIGN_A);
      expect(result.data[0].member_count).toBe(1);
    }
  });

  it('returns an empty array when the user has no memberships, without a second query', async () => {
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await listMyMemberships();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([]);
    }
    // Second query MUST NOT have been fired — the count lookup short-circuits
    // when there are no campaign ids to tally.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('maps an unknown Postgres error from the join query to unknown', async () => {
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'internal_error', details: '', hint: '' },
    });

    const result = await listMyMemberships();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });

  it('surfaces an error from the count query through to the caller', async () => {
    queryMock.mockResolvedValueOnce({
      data: [{ role: 'gm', campaign: SAMPLE_CAMPAIGN_A }],
      error: null,
    });
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'internal_error', details: '', hint: '' },
    });

    const result = await listMyMemberships();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});

describe('getMemberCountsByCampaign', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    queryMock.mockReset();
  });

  it('returns an empty map without hitting the network for an empty input', async () => {
    const result = await getMemberCountsByCampaign([]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('tallies rows per campaign id', async () => {
    queryMock.mockResolvedValueOnce({
      data: [
        { campaign_id: 'a' },
        { campaign_id: 'a' },
        { campaign_id: 'a' },
        { campaign_id: 'b' },
      ],
      error: null,
    });

    const result = await getMemberCountsByCampaign(['a', 'b']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ a: 3, b: 1 });
    }
  });

  it('maps an unknown Postgres error to unknown', async () => {
    queryMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'internal_error', details: '', hint: '' },
    });

    const result = await getMemberCountsByCampaign(['a']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unknown');
    }
  });
});
