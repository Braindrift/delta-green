/**
 * Unit tests for `useCurrentCampaignRole` (DEL-60).
 *
 * The two upstream contexts (`useCurrentCampaign`, `useAuth`) and the data
 * layer (`getMyMembershipRole`) are all mocked at the module boundary so
 * these tests exercise only the hook's own state machine — branch coverage
 * by intent, not integration coverage. The end-to-end RLS path lives on
 * the existing members-screen smoke tests; nothing here touches Supabase.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// ---- mocks (hoisted, mirrors CampaignContext.test.tsx pattern) -------------

const { getMyMembershipRoleMock, useAuthMock, useCurrentCampaignMock } = vi.hoisted(
  () => ({
    getMyMembershipRoleMock: vi.fn(),
    useAuthMock: vi.fn(),
    useCurrentCampaignMock: vi.fn(),
  }),
);

vi.mock('@/lib/members', () => ({
  getMyMembershipRole: (campaignId: string) => getMyMembershipRoleMock(campaignId),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/contexts/CampaignContext', () => ({
  useCurrentCampaign: () => useCurrentCampaignMock(),
}));

// ---- SUT ------------------------------------------------------------------

import { useCurrentCampaignRole } from '@/hooks/useCurrentCampaignRole';

// ---- fixtures -------------------------------------------------------------

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';

const SAMPLE_CAMPAIGN = {
  id: CAMPAIGN_ID,
  owner_id: USER_ID,
  name: 'Operation Black Wire',
  codename: null,
  description: null,
  max_agents: 6,
  created_at: '2026-05-21T00:00:00Z',
  updated_at: '2026-05-21T00:00:00Z',
  deleted_at: null,
};

// ---- helpers --------------------------------------------------------------

/**
 * Renders a probe that calls the hook and writes a compact summary to the
 * DOM so tests can assert via `getByTestId` (matching the existing
 * CampaignContext test style, which avoids React 19 effect-scheduling
 * surprises that catch out captured-state-array probes).
 */
function renderProbe() {
  function Probe() {
    const value = useCurrentCampaignRole();
    return (
      <div data-testid="probe">
        {value.isLoading
          ? 'loading'
          : value.error
            ? `error:${value.error.kind}`
            : value.role
              ? `role:${value.role}:gm=${value.isGM}:player=${value.isPlayer}`
              : 'no-role'}
      </div>
    );
  }
  return render(<Probe />);
}

// ---- common setup ---------------------------------------------------------

beforeEach(() => {
  getMyMembershipRoleMock.mockReset();
  useAuthMock.mockReset();
  useCurrentCampaignMock.mockReset();

  // Defaults: authed user, campaign loaded. Tests override as needed.
  useAuthMock.mockReturnValue({
    user: { id: USER_ID },
    session: { user: { id: USER_ID } },
    loading: false,
  });
  useCurrentCampaignMock.mockReturnValue({
    campaign: SAMPLE_CAMPAIGN,
    isLoading: false,
    error: null,
  });
});

// ===========================================================================
// Outside a campaign route
// ===========================================================================

describe('useCurrentCampaignRole — outside a campaign route', () => {
  it('returns the idle no-role state and does not fetch', async () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: false,
      error: null,
    });

    renderProbe();

    expect(screen.getByTestId('probe')).toHaveTextContent('no-role');
    expect(getMyMembershipRoleMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Campaign context is still loading
// ===========================================================================

describe('useCurrentCampaignRole — campaign mid-load', () => {
  it('mirrors isLoading and does not fetch yet', async () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: true,
      error: null,
    });

    renderProbe();

    expect(screen.getByTestId('probe')).toHaveTextContent('loading');
    expect(getMyMembershipRoleMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Campaign load errored
// ===========================================================================

describe('useCurrentCampaignRole — campaign load failed', () => {
  it('returns the idle no-role state and does not fetch', async () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: false,
      error: { kind: 'not_found_or_forbidden' },
    });

    renderProbe();

    expect(screen.getByTestId('probe')).toHaveTextContent('no-role');
    expect(getMyMembershipRoleMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// No authenticated user
// ===========================================================================

describe('useCurrentCampaignRole — no auth user', () => {
  it('returns the idle no-role state and does not fetch', async () => {
    useAuthMock.mockReturnValue({
      user: null,
      session: null,
      loading: false,
    });

    renderProbe();

    expect(screen.getByTestId('probe')).toHaveTextContent('no-role');
    expect(getMyMembershipRoleMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Role: Handler
// ===========================================================================

describe('useCurrentCampaignRole — Handler', () => {
  it('returns role=gm with isGM=true', async () => {
    getMyMembershipRoleMock.mockResolvedValueOnce({ ok: true, data: 'gm' });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(
        'role:gm:gm=true:player=false',
      );
    });
    expect(getMyMembershipRoleMock).toHaveBeenCalledWith(CAMPAIGN_ID);
  });
});

// ===========================================================================
// Role: player
// ===========================================================================

describe('useCurrentCampaignRole — player', () => {
  it('returns role=player with isPlayer=true', async () => {
    getMyMembershipRoleMock.mockResolvedValueOnce({ ok: true, data: 'player' });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(
        'role:player:gm=false:player=true',
      );
    });
  });
});

// ===========================================================================
// No active membership row
// ===========================================================================

describe('useCurrentCampaignRole — no membership row', () => {
  it('returns role=null with no error when the data layer resolves to null', async () => {
    getMyMembershipRoleMock.mockResolvedValueOnce({ ok: true, data: null });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('no-role');
    });
  });
});

// ===========================================================================
// Mid-fetch (loading state while the data layer is in flight)
// ===========================================================================

describe('useCurrentCampaignRole — mid-fetch', () => {
  it('reports isLoading: true until the data layer resolves', async () => {
    let resolve!: (v: { ok: true; data: 'gm' }) => void;
    getMyMembershipRoleMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderProbe();

    // The hook clears state via a queued microtask, then the fetch is
    // pending — the derivation reports `loading`.
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('loading');
    });

    await act(async () => {
      resolve({ ok: true, data: 'gm' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent(
        'role:gm:gm=true:player=false',
      );
    });
  });
});

// ===========================================================================
// Unexpected data-layer error
// ===========================================================================

describe('useCurrentCampaignRole — unexpected error', () => {
  it('surfaces error.kind=unknown for non-ok results other than null', async () => {
    getMyMembershipRoleMock.mockResolvedValueOnce({
      ok: false,
      kind: 'unknown',
      cause: new Error('boom'),
    });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('error:unknown');
    });
  });
});

// ===========================================================================
// User-id invalidation
// ===========================================================================

describe('useCurrentCampaignRole — user invalidation', () => {
  it('does not surface a stale role across a sign-out + sign-in as a different user', async () => {
    // First render: USER_ID gets 'gm'.
    getMyMembershipRoleMock.mockResolvedValueOnce({ ok: true, data: 'gm' });

    const { rerender } = renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('role:gm');
    });

    // Switch to a different user. The cache slot's userId differs from
    // the new auth user, so the derivation must report loading until the
    // refetch lands.
    useAuthMock.mockReturnValue({
      user: { id: OTHER_USER_ID },
      session: { user: { id: OTHER_USER_ID } },
      loading: false,
    });
    getMyMembershipRoleMock.mockResolvedValueOnce({ ok: true, data: 'player' });

    function Probe2() {
      const value = useCurrentCampaignRole();
      return (
        <div data-testid="probe">
          {value.isLoading ? 'loading' : value.role ?? 'no-role'}
        </div>
      );
    }
    rerender(<Probe2 />);

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('player');
    });
  });
});
