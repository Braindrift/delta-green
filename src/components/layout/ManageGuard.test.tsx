/**
 * Unit tests for `ManageGuard` (DEL-74).
 *
 * The guard is a thin projection of `useCurrentCampaignRole` onto three
 * outcomes — loading, allowed, denied. The hook itself is exhaustively
 * tested in `useCurrentCampaignRole.test.tsx`; here we mock the hook
 * directly and pin each projection.
 *
 * Cases:
 *   - `isLoading: true`  → shows the "verifying clearance" indicator, no children.
 *   - `isGM: true`       → renders children, no toast.
 *   - `role: 'player'`   → redirects to `/` and fires an error toast.
 *   - `role: null`       → redirects to `/` and fires an error toast.
 *   - `error: 'unknown'` → redirects to `/` and fires an error toast.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---- mocks ----------------------------------------------------------------

const { useCurrentCampaignRoleMock, useToastMock, showToastMock } = vi.hoisted(() => ({
  useCurrentCampaignRoleMock: vi.fn(),
  useToastMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('@/hooks/useCurrentCampaignRole', () => ({
  useCurrentCampaignRole: () => useCurrentCampaignRoleMock(),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => useToastMock(),
}));

// ---- SUT ------------------------------------------------------------------

import { ManageGuard } from '@/components/layout/ManageGuard';
import type { CurrentCampaignRole } from '@/hooks/useCurrentCampaignRole';

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

function setMockRole(value: CurrentCampaignRole) {
  useCurrentCampaignRoleMock.mockReturnValue(value);
  showToastMock.mockClear();
  useToastMock.mockReturnValue({
    toasts: [],
    showToast: showToastMock,
    dismissToast: vi.fn(),
  });
}

const ROLE_LOADING: CurrentCampaignRole = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: true,
  error: null,
};

const ROLE_GM: CurrentCampaignRole = {
  role: 'gm',
  isGM: true,
  isPlayer: false,
  isLoading: false,
  error: null,
};

const ROLE_PLAYER: CurrentCampaignRole = {
  role: 'player',
  isGM: false,
  isPlayer: true,
  isLoading: false,
  error: null,
};

const ROLE_NO_MEMBERSHIP: CurrentCampaignRole = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: false,
  error: null,
};

const ROLE_FETCH_ERROR: CurrentCampaignRole = {
  role: null,
  isGM: false,
  isPlayer: false,
  isLoading: false,
  error: { kind: 'unknown', cause: new Error('boom') },
};

// ---- tests ----------------------------------------------------------------

describe('ManageGuard — loading', () => {
  it('shows a verification indicator while the hook is loading', () => {
    setMockRole(ROLE_LOADING);

    renderGuard();

    expect(screen.getByText('VERIFYING CLEARANCE...')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('ManageGuard — allowed', () => {
  it('renders children when the caller is the Handler', () => {
    setMockRole(ROLE_GM);

    renderGuard();

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('ManageGuard — denied', () => {
  it('redirects to / and fires an error toast for an Agent', async () => {
    setMockRole(ROLE_PLAYER);

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
    setMockRole(ROLE_NO_MEMBERSHIP);

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });
    expect(showToastMock).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/handler/i),
    );
  });

  it('redirects to / and fires an error toast when the role fetch errored', async () => {
    setMockRole(ROLE_FETCH_ERROR);

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
