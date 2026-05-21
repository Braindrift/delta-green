/**
 * Unit tests for `ManageGuard`.
 *
 * Covers the DoD routing cases:
 *   - Loading state → shows the "verifying clearance" indicator, no children.
 *   - Handler resolves → renders children.
 *   - Agent resolves → redirects to `/` and fires an error toast.
 *   - No active membership → redirects to `/` and fires an error toast.
 *   - Unknown fetch failure → redirects + toast (failed reads collapse
 *     into the same "you can't be here" surface).
 *
 * DEL-74 swapped the local fetch for `useCurrentCampaignRole`, so the
 * test mocks the hook directly. `useToast` is also mocked because the
 * guard fires the denied toast from there.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---- mocks ----------------------------------------------------------------

const { useCurrentCampaignRoleMock, useToastMock, showToastMock } = vi.hoisted(
  () => ({
    useCurrentCampaignRoleMock: vi.fn(),
    useToastMock: vi.fn(),
    showToastMock: vi.fn(),
  }),
);

vi.mock('@/hooks/useCurrentCampaignRole', () => ({
  useCurrentCampaignRole: () => useCurrentCampaignRoleMock(),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => useToastMock(),
}));

// ---- SUT ------------------------------------------------------------------

import { ManageGuard } from '@/components/layout/ManageGuard';

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

type RoleState = {
  role: 'gm' | 'player' | null;
  isGM: boolean;
  isPlayer: boolean;
  isLoading: boolean;
  error: { kind: 'unknown'; cause: unknown } | null;
};

const IDLE_DEFAULTS: RoleState = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: false,
  error: null,
};

function setupMocks(state: Partial<RoleState>) {
  useCurrentCampaignRoleMock.mockReturnValue({ ...IDLE_DEFAULTS, ...state });
  showToastMock.mockClear();
  useToastMock.mockReturnValue({
    toasts: [],
    showToast: showToastMock,
    dismissToast: vi.fn(),
  });
}

// ---- tests ----------------------------------------------------------------

describe('ManageGuard — loading', () => {
  it('shows a verification indicator while the role query is in flight', () => {
    setupMocks({ isLoading: true });

    renderGuard();

    expect(screen.getByText('VERIFYING CLEARANCE...')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('ManageGuard — allowed', () => {
  it('renders children when the caller is the Handler', async () => {
    setupMocks({ role: 'gm', isGM: true });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument();
    });
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('ManageGuard — denied', () => {
  it('redirects to / and fires an error toast for an Agent', async () => {
    setupMocks({ role: 'player', isPlayer: true });

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
    setupMocks({ role: null });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(showToastMock).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/handler/i),
    );
  });

  it('redirects and toasts when the role fetch fails unexpectedly', async () => {
    setupMocks({ role: null, error: { kind: 'unknown', cause: new Error('boom') } });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(showToastMock).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/handler/i),
    );
  });
});
