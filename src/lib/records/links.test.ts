/**
 * Unit tests for the cross-record link layer (`links.ts`).
 *
 * Every link function awaits the PostgREST builder directly rather than
 * terminating in `.single()`, so all results flow through the `.then(...)`
 * fall-through backed by `queryMock`. `getLinkedRecords` issues two selects
 * via `Promise.all`, consuming two queued `queryMock` values in order
 * (forward direction first, then reverse).
 *
 * The RLS path is validated via smoke-test SQL against the linked Supabase
 * project — these tests cover the Result-shape contract, the idempotent
 * "already linked" mapping, and the forward/reverse merge + de-dupe logic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnyRecord } from '@/types/records';

const { queryMock, insertMock, orMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  insertMock: vi.fn(),
  orMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((...args: unknown[]) => {
      insertMock(...args);
      return builder;
    });
    builder.delete = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.or = vi.fn((...args: unknown[]) => {
      orMock(...args);
      return builder;
    });
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

import { getLinkedRecords, linkRecords, unlinkRecords } from '@/lib/records';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const ID_A = '22222222-2222-4222-8222-222222222222';
const ID_B = '33333333-3333-4333-8333-333333333333';

function pgError(code: string) {
  return { code, message: code, details: '', hint: '' };
}

/** Minimal record fixture — only `id` matters for the merge/de-dupe assertions. */
function rec(id: string): AnyRecord {
  return {
    id,
    campaign_id: CAMPAIGN_ID,
    record_type: 'civilian',
    name: `Record ${id}`,
    tags: [],
    date_encountered: null,
    visibility_overrides: {},
    data: { narrative: '', photos: [], is_stub: false },
    created_at: '2026-05-18T00:00:00Z',
    updated_at: '2026-05-18T00:00:00Z',
    deleted_at: null,
  } as AnyRecord;
}

beforeEach(() => {
  queryMock.mockReset();
  insertMock.mockReset();
  orMock.mockReset();
});

describe('linkRecords', () => {
  it('returns ok and inserts the pair on success', async () => {
    queryMock.mockResolvedValueOnce({ error: null });

    const result = await linkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(true);
    expect(insertMock).toHaveBeenCalledWith({
      campaign_id: CAMPAIGN_ID,
      record_id_a: ID_A,
      record_id_b: ID_B,
    });
  });

  it('treats a 23505 conflict as success (idempotent already-linked)', async () => {
    queryMock.mockResolvedValueOnce({ error: pgError('23505') });

    const result = await linkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(true);
  });

  it('maps 42501 (RLS) to forbidden', async () => {
    queryMock.mockResolvedValueOnce({ error: pgError('42501') });

    const result = await linkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('maps generic Postgres errors to unknown', async () => {
    queryMock.mockResolvedValueOnce({ error: pgError('XX000') });

    const result = await linkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});

describe('unlinkRecords', () => {
  it('returns ok on success and matches both pair directions', async () => {
    queryMock.mockResolvedValueOnce({ error: null });

    const result = await unlinkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(true);
    // The order-agnostic filter references both directions of the pair.
    const orArg = orMock.mock.calls[0][0] as string;
    expect(orArg).toContain(`record_id_a.eq.${ID_A}`);
    expect(orArg).toContain(`record_id_b.eq.${ID_B}`);
    expect(orArg).toContain(`record_id_a.eq.${ID_B}`);
    expect(orArg).toContain(`record_id_b.eq.${ID_A}`);
  });

  it('returns ok even when nothing matched', async () => {
    queryMock.mockResolvedValueOnce({ error: null });

    const result = await unlinkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(true);
  });

  it('maps Postgres errors to the typed Result', async () => {
    queryMock.mockResolvedValueOnce({ error: pgError('42501') });

    const result = await unlinkRecords(CAMPAIGN_ID, ID_A, ID_B);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });
});

describe('getLinkedRecords', () => {
  it('merges forward and reverse directions', async () => {
    queryMock
      .mockResolvedValueOnce({ data: [{ linked: rec(ID_B) }], error: null })
      .mockResolvedValueOnce({ data: [{ linked: rec('44444444-4444-4444-8444-444444444444') }], error: null });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((r) => r.id)).toEqual([
        ID_B,
        '44444444-4444-4444-8444-444444444444',
      ]);
    }
  });

  it('de-dupes a record returned in both directions', async () => {
    queryMock
      .mockResolvedValueOnce({ data: [{ linked: rec(ID_B) }], error: null })
      .mockResolvedValueOnce({ data: [{ linked: rec(ID_B) }], error: null });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it('flattens an array-shaped embed and skips null embeds', async () => {
    queryMock
      .mockResolvedValueOnce({ data: [{ linked: [rec(ID_B)] }, { linked: null }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map((r) => r.id)).toEqual([ID_B]);
  });

  it('maps a forward-select error', async () => {
    queryMock
      .mockResolvedValueOnce({ data: null, error: pgError('XX000') })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });

  it('maps a reverse-select error', async () => {
    queryMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('maps null data (no error) to unknown', async () => {
    queryMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await getLinkedRecords(CAMPAIGN_ID, ID_A);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});
