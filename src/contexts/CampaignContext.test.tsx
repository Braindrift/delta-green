/**
 * Unit tests for `CampaignProvider` + `useCurrentCampaign`.
 *
 * Covers every branch from the DoD:
 *   - Outside `/campaigns/:campaignId/...` → { null, false, null }
 *   - Inside with a valid id → fetches and exposes the campaign
 *   - Inside with a non-UUID id → { null, false, invalid_uuid }
 *   - Inside with a UUID id the user has no access to → not_found_or_forbidden
 *   - Generic Postgres failure → unknown
 *   - useCurrentCampaign called outside a provider → throws
 *
 * `useAuth` is mocked because `CampaignProvider` reads `user.id` to gate
 * fetches. `getCampaignById` is mocked at the module boundary so the tests
 * don't touch Supabase. The end-to-end RLS path is validated by
 * `scripts/smoke-test-del-38.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

// ---- mocks (must be hoisted before SUT import) ----------------------------
//
// `vi.mock` calls are hoisted by Vitest above all top-level `const`/`import`
// statements. Any variable the mock factory closes over must therefore be
// declared via `vi.hoisted` so it's available when the factory runs at
// module-load time. This is the recommended pattern; using a plain
// top-level `const` only works by accident when the variable is read lazily
// (i.e. only inside the returned object's methods, never at factory body
// evaluation time). Keeping every test on `vi.hoisted` removes that
// footgun.

const { getCampaignByIdMock, useAuthMock } = vi.hoisted(() => ({
  getCampaignByIdMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/lib/campaigns', () => ({
  getCampaignById: (id: string) => getCampaignByIdMock(id),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

// ---- SUT ------------------------------------------------------------------

import { CampaignProvider, useCurrentCampaign } from '@/contexts/CampaignContext';

// ---- fixtures -------------------------------------------------------------

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-4999-8999-999999999999';

const SAMPLE_CAMPAIGN = {
  id: VALID_UUID,
  owner_id: USER_ID,
  name: 'Operation Black Wire',
  codename: 'BLACK WIRE',
  description: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

// ---- helpers --------------------------------------------------------------

/**
 * Renders a probe component inside `<CampaignProvider>` mounted under the
 * given route, with the URL set so React Router resolves `:campaignId` from
 * the given path. The probe writes the context value to a captured ref so
 * tests can assert on it across renders.
 */
function renderWithRoute(initialPath: string, routePath: string) {
  const states: ReturnType<typeof useCurrentCampaign>[] = [];

  function Probe() {
    const value = useCurrentCampaign();
    states.push(value);
    return (
      <div data-testid="probe">
        {value.isLoading
          ? 'loading'
          : value.error
            ? `error:${value.error.kind}`
            : value.campaign
              ? `campaign:${value.campaign.id}`
              : 'none'}
      </div>
    );
  }

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={routePath}
          element={
            <CampaignProvider>
              <Probe />
            </CampaignProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  return states;
}

// ---- common setup ---------------------------------------------------------

beforeEach(() => {
  getCampaignByIdMock.mockReset();
  useAuthMock.mockReset();
  // Default: authenticated user. Individual tests override as needed.
  useAuthMock.mockReturnValue({
    user: { id: USER_ID },
    session: { user: { id: USER_ID } },
    loading: false,
  });
});

// ===========================================================================
// State: outside a campaign-id route
// ===========================================================================

describe('CampaignProvider — outside a campaign-id route', () => {
  it('returns { null, false, null } and does not fetch', async () => {
    renderWithRoute('/somewhere', '/somewhere');

    // Assert via the rendered DOM rather than the captured-state array,
    // because React 19's effect scheduling can run an extra render or two.
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
    expect(getCampaignByIdMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// State: inside a campaign-id route with a valid UUID
// ===========================================================================

describe('CampaignProvider — inside a campaign-id route', () => {
  it('fetches the campaign and exposes it', async () => {
    getCampaignByIdMock.mockResolvedValueOnce({ ok: true, data: SAMPLE_CAMPAIGN });

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(`campaign:${VALID_UUID}`);
    });

    expect(getCampaignByIdMock).toHaveBeenCalledWith(VALID_UUID);
  });

  it('surfaces invalid_uuid for a malformed campaign id without round-tripping', async () => {
    renderWithRoute('/campaigns/not-a-uuid', '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:invalid_uuid');
    });

    expect(getCampaignByIdMock).not.toHaveBeenCalled();
  });

  it('surfaces not_found_or_forbidden when the data layer returns not_found', async () => {
    getCampaignByIdMock.mockResolvedValueOnce({ ok: false, kind: 'not_found' });

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:not_found_or_forbidden');
    });
  });

  it('surfaces not_found_or_forbidden when the data layer returns forbidden', async () => {
    getCampaignByIdMock.mockResolvedValueOnce({
      ok: false,
      kind: 'forbidden',
      cause: { code: '42501', message: 'rls', details: '', hint: '' },
    });

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:not_found_or_forbidden');
    });
  });

  it('surfaces unknown for unexpected data-layer failures', async () => {
    getCampaignByIdMock.mockResolvedValueOnce({
      ok: false,
      kind: 'unknown',
      cause: new Error('boom'),
    });

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:unknown');
    });
  });

  it('passes through a loading state before the campaign resolves', async () => {
    let resolveFn: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveFn = resolve;
    });
    getCampaignByIdMock.mockReturnValueOnce(pending);

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    // Mid-flight: should show loading.
    expect(screen.getByTestId('probe')).toHaveTextContent('loading');

    resolveFn({ ok: true, data: SAMPLE_CAMPAIGN });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(`campaign:${VALID_UUID}`);
    });
  });
});

// ===========================================================================
// State: unauthenticated
// ===========================================================================

describe('CampaignProvider — unauthenticated', () => {
  it('surfaces not_found_or_forbidden when no user is signed in', async () => {
    useAuthMock.mockReturnValue({ user: null, session: null, loading: false });

    renderWithRoute(`/campaigns/${VALID_UUID}`, '/campaigns/:campaignId');

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:not_found_or_forbidden');
    });

    expect(getCampaignByIdMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// State: hook used outside provider
// ===========================================================================

describe('useCurrentCampaign — without a provider', () => {
  it('throws a clear error', () => {
    // Suppress the expected console.error from React's render error.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      renderHook(() => useCurrentCampaign(), {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
      }),
    ).toThrow(/must be used inside <CampaignProvider>/);

    consoleError.mockRestore();
  });
});
