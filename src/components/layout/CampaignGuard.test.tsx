/**
 * Unit tests for `CampaignGuard`.
 *
 * Covers the DoD routing cases:
 *   - Loading state → shows loading indicator, does not render children.
 *   - Campaign unavailable (null) → redirects to `/campaigns`.
 *   - Campaign present → renders children.
 *
 * `useCurrentCampaign` is mocked at the module boundary so these tests
 * don't need a real CampaignProvider or Supabase connection.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---- mocks ----------------------------------------------------------------

const { useCurrentCampaignMock } = vi.hoisted(() => ({
  useCurrentCampaignMock: vi.fn(),
}));

vi.mock('@/contexts/CampaignContext', () => ({
  useCurrentCampaign: () => useCurrentCampaignMock(),
}));

// ---- SUT ------------------------------------------------------------------

import { CampaignGuard } from '@/components/layout/CampaignGuard';

// ---- fixtures -------------------------------------------------------------

const SAMPLE_CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '99999999-9999-4999-8999-999999999999',
  name: 'Operation Black Wire',
  codename: 'BLACK WIRE',
  description: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  deleted_at: null,
};

// ---- helpers --------------------------------------------------------------

function renderGuard(initialPath = '/campaign-route') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/campaign-route"
          element={
            <CampaignGuard>
              <div data-testid="children">CHILDREN</div>
            </CampaignGuard>
          }
        />
        <Route path="/campaigns" element={<div data-testid="workspace">WORKSPACE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---- tests ----------------------------------------------------------------

describe('CampaignGuard — loading', () => {
  it('shows a loading indicator and does not render children', () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: true,
      error: null,
    });

    renderGuard();

    expect(screen.getByText('LOADING...')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });
});

describe('CampaignGuard — invalid or inaccessible campaign id', () => {
  it('redirects to /campaigns when campaign is null after loading', () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: false,
      error: { kind: 'not_found_or_forbidden' },
    });

    renderGuard();

    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('redirects to /campaigns for an invalid UUID error', () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: false,
      error: { kind: 'invalid_uuid' },
    });

    renderGuard();

    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });

  it('redirects to /campaigns when campaign is null with no error (outside campaign route)', () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: null,
      isLoading: false,
      error: null,
    });

    renderGuard();

    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('children')).not.toBeInTheDocument();
  });
});

describe('CampaignGuard — valid campaign', () => {
  it('renders children when campaign is present', () => {
    useCurrentCampaignMock.mockReturnValue({
      campaign: SAMPLE_CAMPAIGN,
      isLoading: false,
      error: null,
    });

    renderGuard();

    expect(screen.getByTestId('children')).toBeInTheDocument();
    expect(screen.queryByText('LOADING...')).not.toBeInTheDocument();
  });
});
