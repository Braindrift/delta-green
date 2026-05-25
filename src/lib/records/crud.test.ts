/**
 * Unit tests for the record CRUD layer (`crud.ts`).
 *
 * Same mocking pattern as `@/lib/campaigns/mutations.test.ts`: a thenable
 * PostgREST builder whose chain methods return `this`, with `.single()` /
 * `.maybeSingle()` terminals backed by dedicated mocks and a `.then(...)`
 * fall-through for chains that are awaited directly (`listRecords`). Unlike
 * the campaigns layer, these functions never touch `supabase.auth`, so no
 * session mock is needed.
 *
 * Results are queued in call order with `mockResolvedValueOnce`. The two
 * round-trips inside `updateRecord` (read-then-write) both terminate in
 * `.maybeSingle()`, so they consume two queued `maybeSingleMock` values.
 *
 * The RLS path itself is validated via smoke-test SQL against the linked
 * Supabase project — these tests cover the Result-shape contract and the
 * client-side merge logic only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OperationRecord } from '@/types/records';

const { singleMock, maybeSingleMock, queryMock, insertMock, updateMock } = vi.hoisted(() => ({
  singleMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  queryMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((...args: unknown[]) => {
      insertMock(...args);
      return builder;
    });
    builder.update = vi.fn((...args: unknown[]) => {
      updateMock(...args);
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.single = singleMock;
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
  createRecord,
  getRecord,
  listRecords,
  softDeleteRecord,
  updateRecord,
} from '@/lib/records';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';

const SAMPLE_OPERATION: OperationRecord = {
  id: RECORD_ID,
  campaign_id: CAMPAIGN_ID,
  record_type: 'operation',
  name: 'Operation Black Wire',
  tags: ['priority'],
  date_encountered: null,
  visibility_overrides: {},
  data: {
    narrative: 'Initial briefing.',
    photos: [],
    is_stub: false,
    status: 'active',
    sessions: [],
    conspiracy_board: null,
  },
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
  deleted_at: null,
};

/** PostgREST error shape, minimal but matching the fields `mapPostgrestError` reads. */
function pgError(code: string) {
  return { code, message: code, details: '', hint: '' };
}

beforeEach(() => {
  singleMock.mockReset();
  maybeSingleMock.mockReset();
  queryMock.mockReset();
  insertMock.mockReset();
  updateMock.mockReset();
});

describe('createRecord', () => {
  it('returns ok with the inserted row on success', async () => {
    singleMock.mockResolvedValueOnce({ data: SAMPLE_OPERATION, error: null });

    const result = await createRecord(CAMPAIGN_ID, 'operation', {
      name: SAMPLE_OPERATION.name,
      data: SAMPLE_OPERATION.data,
      tags: ['priority'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(SAMPLE_OPERATION);
    }
    // Scoping + discriminator must be baked into the insert payload.
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: CAMPAIGN_ID,
        record_type: 'operation',
        name: SAMPLE_OPERATION.name,
        tags: ['priority'],
        date_encountered: null,
        visibility_overrides: {},
      }),
    );
  });

  it('defaults optional fields when omitted', async () => {
    singleMock.mockResolvedValueOnce({ data: SAMPLE_OPERATION, error: null });

    await createRecord(CAMPAIGN_ID, 'operation', {
      name: 'No options',
      data: SAMPLE_OPERATION.data,
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [], date_encountered: null, visibility_overrides: {} }),
    );
  });

  it('maps 42501 (RLS) to forbidden', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await createRecord(CAMPAIGN_ID, 'operation', {
      name: 'X',
      data: SAMPLE_OPERATION.data,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  it('maps 23505 (unique violation) to conflict', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('23505') });

    const result = await createRecord(CAMPAIGN_ID, 'operation', {
      name: 'X',
      data: SAMPLE_OPERATION.data,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('conflict');
  });

  it('maps generic Postgres errors to unknown', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await createRecord(CAMPAIGN_ID, 'operation', {
      name: 'X',
      data: SAMPLE_OPERATION.data,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});

describe('getRecord', () => {
  it('returns ok with the row on success', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: SAMPLE_OPERATION, error: null });

    const result = await getRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(SAMPLE_OPERATION);
  });

  it('maps an empty result to not_found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await getRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('maps PGRST116 to not_found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('PGRST116') });

    const result = await getRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('maps generic Postgres errors to unknown', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await getRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});

describe('updateRecord', () => {
  it('shallow-merges the data patch over the current row, then writes', async () => {
    // Round 1: read current `data`. Round 2: write merged row back.
    maybeSingleMock
      .mockResolvedValueOnce({ data: { data: SAMPLE_OPERATION.data }, error: null })
      .mockResolvedValueOnce({
        data: { ...SAMPLE_OPERATION, data: { ...SAMPLE_OPERATION.data, status: 'closed' } },
        error: null,
      });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', {
      data: { status: 'closed' },
    });

    expect(result.ok).toBe(true);
    // The write payload's `data` is `{ ...current, ...patch }`: existing keys
    // preserved, patched key overridden.
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ...SAMPLE_OPERATION.data, status: 'closed' },
      }),
    );
  });

  it('skips the read round-trip for a column-only patch', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { ...SAMPLE_OPERATION, name: 'Renamed' },
      error: null,
    });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', { name: 'Renamed' });

    expect(result.ok).toBe(true);
    // Only the write happened — one maybeSingle call, no merged `data` written.
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({ name: 'Renamed' });
  });

  it('only writes the fields the caller specified', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: SAMPLE_OPERATION, error: null });

    await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', { tags: ['flagged'] });

    expect(updateMock).toHaveBeenCalledWith({ tags: ['flagged'] });
  });

  it('returns not_found when the read round-trip finds nothing', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', {
      data: { status: 'closed' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
    // Should not have attempted the write.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns not_found when the write matches no row', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', { name: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('maps a read-round-trip error and skips the write', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', {
      data: { status: 'closed' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('maps a write error to forbidden', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('42501') });

    const result = await updateRecord(CAMPAIGN_ID, RECORD_ID, 'operation', { name: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });
});

describe('softDeleteRecord', () => {
  it('sets deleted_at and returns the row on success', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { ...SAMPLE_OPERATION, deleted_at: '2026-05-25T00:00:00Z' },
      error: null,
    });

    const result = await softDeleteRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
  });

  it('maps an empty result to not_found', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await softDeleteRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  it('maps generic Postgres errors to unknown', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await softDeleteRecord(CAMPAIGN_ID, RECORD_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});

describe('listRecords', () => {
  it('returns ok with the rows (type-filtered)', async () => {
    queryMock.mockResolvedValueOnce({ data: [SAMPLE_OPERATION], error: null });

    const result = await listRecords(CAMPAIGN_ID, 'operation');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([SAMPLE_OPERATION]);
  });

  it('returns ok with the rows (no type filter)', async () => {
    queryMock.mockResolvedValueOnce({ data: [SAMPLE_OPERATION], error: null });

    const result = await listRecords(CAMPAIGN_ID);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveLength(1);
  });

  it('returns an empty array without error', async () => {
    queryMock.mockResolvedValueOnce({ data: [], error: null });

    const result = await listRecords(CAMPAIGN_ID, 'operation');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it('maps null data to unknown', async () => {
    queryMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await listRecords(CAMPAIGN_ID, 'operation');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });

  it('maps generic Postgres errors to unknown', async () => {
    queryMock.mockResolvedValueOnce({ data: null, error: pgError('XX000') });

    const result = await listRecords(CAMPAIGN_ID, 'operation');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unknown');
  });
});
