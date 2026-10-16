import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScanPhotoGallery, stampText, type ScanPhoto } from '@/components/audits/ScanPhotoGallery';

// Stage 1.9: scan photos on the audit pages, with their time and position.

const get = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

const photo = (id: string, extra: Partial<ScanPhoto> = {}): ScanPhoto => ({
  id, hasThumb: true, tagValue: 'RFID-1', photoType: 'inventory', result: 'found',
  latitude: 41.7151, longitude: 44.8271, geoAccuracyMeters: 6.4, capturedAt: '2026-10-16T08:30:00Z', ...extra,
});

function renderGallery(photos: ScanPhoto[], locationId?: string) {
  get.mockImplementation((path: string) => Promise.resolve({
    data: path.endsWith('/photos') ? photos : new Blob(['x']),
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ScanPhotoGallery campaignId="c1" locationId={locationId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:photo');
});

describe('stampText', () => {
  it('shows tag, time and position with accuracy', () => {
    expect(stampText(photo('p1'))).toMatch(/^RFID-1 · 16 Oct 2026, \d{2}:30 · 41\.715100, 44\.827100 ±6 m$/);
  });

  it('says when position or time is missing', () => {
    expect(stampText(photo('p1', { latitude: null, longitude: null, capturedAt: null, tagValue: null })))
      .toBe('Unknown tag · Time not recorded · No position');
  });
});

describe('ScanPhotoGallery', () => {
  it('renders nothing for a campaign without photos', async () => {
    renderGallery([]);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText(/Scan photos/)).toBeNull();
  });

  it('lists photos for a zone and opens one with its stamp', async () => {
    renderGallery([photo('p1'), photo('p2', { tagValue: 'RFID-2' })], 'zone-a');
    expect(await screen.findByText('Scan photos (2)')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/api/v1/audits/c1/photos', { params: { locationId: 'zone-a' } });
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/^RFID-2 ·/)).toBeTruthy();
  });
});
