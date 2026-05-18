/**
 * Unit tests for `ManageGuard`.
 *
 * Covers the DoD routing cases:
 *   - Loading state → shows the "verifying clearance" indicator, no children.
 *   - Handler resolves → renders children.
 *   - Agent resolves → redirects to `/` and fires an error toast.
 *   - No active membership → redirects to `/` and fires an error toast.
 *
 * `useCurrentCampaign`, `useToast`, and `getMyRoleInCampaign` are all mocked at
 * the module boundary. The guard's contract is "given these three inputs,
 * produce one of three outputs"; the tests pin each combination directly
 * rather than wiring up real providers.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---- mocks ----------------------------------------------------------------

const { useCurrentCampaignMock, useToastMock, getMyRoleInCampaignMock, showToastMock } =
  vi.hoisted(() => ({
    useCurrentCampaignMock: vi.fn(),
    useToastMock: vi.fn(),
    getMyRoleInCampaignMock: vi.fn(),
    showToastMock: vi.fn(),
  }));

vi.mock('@/contexts/CampaignContext', () => ({
  useCurrentCampaign: () => useCurrentCampaignMock(),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => useToastMock(),
}));

vi.mock('@/lib/campaigns', () => ({
  getMyRoleInCampaign: (id: string) => getMyRoleInCampaignMock(id),
}));

// ---- SUT ------------------------------------------------------------------

import { ManageGuard } from '@/components/layout/ManageGuard';

// ---- fixtures -------------------------------------------------------------

const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '99999999-9999-4999-8999-999999999999',
  name: 'Operation Black Wire',
  codename: 'BLACK WIRE',
  description: null,
  max_agents: 6,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

// ---- helpers --------------------------------------------------------------

function renderGuard(initialPath = '/manage-route') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/manage-route"
          element={
            <ManageGuard>
              <div data-testid="children">CHILDREN</div>
            </ManageGuard>
          }
        />
        <Route path="/" element={<div data-testid="landing">LANDING</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setupMocks(opts: {
  campaign?: typeof SAMPLE_CAMPAIGN | null;
  roleResult?:
    | { ok: true; data: 'gm' | 'player' }
    | { ok: false; kind: 'not_found' | 'unknown' | 'forbidden' };
}) {
  // `??` would coalesce `null` to `SAMPLE_CAMPAIGN` (only `undefined` should
  // fall back) — use an explicit `in` check so the "campaign is null" tests
  // can exercise that branch.
  const campaign = 'campaign' in opts ? opts.campaign : SAMPLE_CAMPAIGN;
  useCurrentCampaignMock.mockReturnValue({
    campaign,
    isLoading: false,
    error: null,
  });
  showToastMock.mockClear();
  useToastMock.mockReturnValue({
    toasts: [],
    showToast: showToastMock,
    dismissToast: vi.fn(),
  });
  getMyRoleInCampaignMock.mockReset();
  if (opts.roleResult !== undefined) {
    getMyRoleInCampaignMock.mockResolvedValueOnce(opts.roleResult);
  }
}

// ---- tests ----------------------------------------------------------------

describe('ManageGuard — loading', () => {
  it('shows a verification indicator while the role query is in flight', async () => {
    setupMocks({
      // Use a deferred promise so we can assert the loading state before resolving.
    });
    let resolveRole!: (
      value: { ok: true; data: 'gm' } | { ok: false; kind: 'not_found' },
    ) => void;
    getMyRoleInCampaignMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRole = resolve;
      }),
    );

    renderGuard();

    expect(screen.getByText('VERIFYING CLEARANCE...')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();

    // Resolve so the effect's cleanup doesn't leak.
    await act(async () => {
      resolveRole({ ok: true, data: 'gm' });
    });
  });
});

describe('ManageGuard — allowed', () => {
  it('renders children when the caller is the Handler', async () => {
    setupMocks({ roleResult: { ok: true, data: 'gm' } });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('ManageGuard — denied', () => {
  it('redirects to / and fires an error toast for an Agent', async () => {
    setupMocks({ roleResult: { ok: true, data: 'player' } });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/handler/i),
    );
  });

  it('redirects to / and fires an error toast when membership is missing', async () => {
    setupMocks({ roleResult: { ok: false, kind: 'not_found' } });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(showToastMock).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/handler/i),
    );
  });

  it('redirects without throwing when the campaign is unexpectedly null', async () => {
    setupMocks({ campaign: null });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    // No role lookup should have been attempted.
    expect(getMyRoleInCampaignMock).not.toHaveBeenCalled();
  });
});
