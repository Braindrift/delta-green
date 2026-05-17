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

// Mock the Supabase client BEFORE importing the SUT. The mock has to expose
// the chainable query-builder shape `.from(...).select(...).eq(...).is(...).maybeSingle()`.
// We capture the final returned value via a per-test setter.
//
// `vi.mock` is hoisted by Vitest above all top-level `const`/`import` statements,
// which means a plain `const maybeSingleMock = vi.fn()` declared above the
// factory is undefined at the moment the factory runs. `vi.hoisted` is the
// supported way to make a variable available inside the hoisted factory —
// it lifts the declaration up alongside the `vi.mock` call.
const { maybeSingleMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: maybeSingleMock,
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

import { getCampaignById } from '@/lib/campaigns';

const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '22222222-2222-4222-8222-222222222222',
  name: 'Operation Black Wire',
  codename: 'BLACK WIRE',
  description: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

describe('getCampaignById', () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
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
