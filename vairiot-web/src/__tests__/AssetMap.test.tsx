import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { boundsOf, escapeHtml, statusColour, STATUS_COLOURS } from '@/lib/assetMap';
import { AssetMapPage } from '@/pages/assets/AssetMapPage';
import type { AssetMapPoint, AssetMapResponse } from '@/types';

const point = (id: string, extra: Partial<AssetMapPoint> = {}): AssetMapPoint => ({
  id, assetNumber: `AST-${id}`, name: `Asset ${id}`, status: 'active', condition: 'good',
  latitude: 41.7, longitude: 44.8, geoAccuracyMeters: 5, category: null, site: null, location: null, ...extra,
});

// Leaflet needs a real layout engine; stand in a button per marker.
vi.mock('@/components/geo/AssetClusterMap', () => ({
  AssetClusterMap: ({ points, onSelect }: { points: AssetMapPoint[]; onSelect: (p: AssetMapPoint) => void }) => (
    <div data-testid="map">{points.map(p => <button key={p.id} onClick={() => onSelect(p)}>marker {p.name}</button>)}</div>
  ),
}));

const get = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p>; }

function renderPage(url = '/assets/map', response: Partial<AssetMapResponse> = {}) {
  get.mockImplementation((path: string) => Promise.resolve({ data:
    path === '/api/v1/assets/map'
      ? { assets: [], total: 0, truncated: false, unplaced: 0, ...response }
      : [],
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="*" element={<><AssetMapPage /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('asset map helpers', () => {
  it('colours markers by status, with a fallback', () => {
    expect(statusColour('lost')).toBe(STATUS_COLOURS.lost.colour);
    expect(statusColour('weird')).toBe(STATUS_COLOURS.other.colour);
  });

  it('escapes names for Leaflet tooltips', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  });

  it('bounds the points', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ latitude: 1, longitude: 5 }, { latitude: -2, longitude: 7 }])).toEqual([[-2, 5], [1, 7]]);
  });
});

describe('AssetMapPage', () => {
  beforeEach(() => get.mockReset());

  it('passes the URL filters to the API and summarises the result', async () => {
    renderPage('/assets/map?siteId=s1&status=active', { assets: [point('1')], total: 1, unplaced: 3 });
    expect(await screen.findByText(/1 asset on the map · 3 without a position/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/v1/assets/map', { params: expect.objectContaining({ siteId: 's1', status: 'active' }) });
  });

  it('shows the selected asset with a link to it', async () => {
    renderPage('/assets/map', { assets: [point('1', { site: { id: 's1', name: 'Head Office' } })], total: 1 });
    fireEvent.click(await screen.findByText('marker Asset 1'));
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.getByText('41.700000, 44.800000')).toBeInTheDocument();
    expect(screen.getByText('Open asset').closest('a')).toHaveAttribute('href', '/assets/1');
  });

  it('explains an empty map', async () => {
    renderPage();
    expect(await screen.findByText('No assets have a map position yet')).toBeInTheDocument();
  });

  it('warns when the result is capped', async () => {
    renderPage('/assets/map', { assets: [point('1')], total: 6000, truncated: true });
    expect(await screen.findByText(/Showing the first 1 of 6,000/)).toBeInTheDocument();
  });

  it('goes back to the list with the same filters', async () => {
    renderPage('/assets/map?categoryId=c1');
    fireEvent.click(await screen.findByText('List view'));
    expect(screen.getByTestId('where')).toHaveTextContent('/assets?categoryId=c1');
  });

  it('switches to a campaign layer coloured by count state', async () => {
    get.mockImplementation((path: string) => Promise.resolve({ data:
      path === '/api/v1/audits' ? [{ id: 'c1', name: 'Park count', status: 'in_progress' }, { id: 'c0', name: 'Draft', status: 'draft' }]
      : path === '/api/v1/audits/c1/map' ? {
        campaign: { id: 'c1', name: 'Park count', mode: 'sighted', status: 'in_progress' },
        points: [
          { id: 'a1', assetId: 'a1', assetNumber: 'AST-1', name: 'Bench', state: 'misplaced', latitude: 41.7, longitude: 44.8, geoAccuracyMeters: null, positionSource: 'register' },
          { id: 's9', assetId: null, assetNumber: null, name: 'STRAY-1', state: 'surplus', latitude: 41.71, longitude: 44.81, geoAccuracyMeters: 5, positionSource: 'scan' },
        ],
        counts: {}, unplaced: 2,
      }
      : { assets: [], total: 0, truncated: false, unplaced: 0 },
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/assets/map?campaign=c1']}>
          <Routes><Route path="*" element={<AssetMapPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Park count: 2 on the map · 2 without a position/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Draft' })).toBeNull();
    expect(screen.getByLabelText('Legend')).toHaveTextContent('Surplus tag');

    fireEvent.click(screen.getByText('marker Bench'));
    expect(screen.getAllByText('Misplaced')).toHaveLength(2); // the panel badge and the legend
    expect(screen.getByText('Open asset').closest('a')).toHaveAttribute('href', '/assets/a1');

    fireEvent.click(screen.getByText('marker STRAY-1'));
    expect(screen.queryByText('Open asset')).toBeNull();
    expect(screen.getByText(/Shown where it was scanned/)).toBeInTheDocument();
  });
});
