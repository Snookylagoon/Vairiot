import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoPositionFields } from '@/components/forms/GeoPositionFields';
import { assetSchema, type AssetFormData } from '@/lib/schemas';
import { MapSettingsPage } from '@/pages/admin/MapSettingsPage';
import { useAuthStore } from '@/stores/auth.store';

// Stage 1.11–1.12: set a position on the map; the tenant's base map settings.

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));
// Leaflet needs a real layout engine; a button stands in for a click on the map.
vi.mock('@/components/geo/PositionPickerMap', () => ({
  PositionPickerMap: ({ onPick }: { onPick: (p: { latitude: number; longitude: number }) => void }) => (
    <button type="button" onClick={() => onPick({ latitude: 41.71512349, longitude: 44.82712349 })}>map click</button>
  ),
}));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  useAuthStore.setState({ user: { permissions: ['company:manage'], featureFlags: { gis: true } } as never });
});

function Harness({ onSubmit }: { onSubmit: (d: AssetFormData) => void }) {
  const { register, setValue, watch, handleSubmit, formState: { errors } } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema), defaultValues: { name: 'Pump', geoSource: 'device', geoAccuracyMeters: '5' },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <GeoPositionFields register={register} setValue={setValue} watch={watch} errors={errors} />
      <button type="submit">save</button>
    </form>
  );
}

describe('Pick on map', () => {
  it('sets the position from the map as a manual entry', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Pick on map'));
    fireEvent.click(screen.getByText('map click'));
    fireEvent.click(screen.getByText('save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      latitude: '41.715123', longitude: '44.827123', geoSource: 'manual', geoAccuracyMeters: '',
    });
  });
});

describe('MapSettingsPage', () => {
  it('loads the settings and saves them as numbers', async () => {
    get.mockResolvedValue({ data: {
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors',
      centreLatitude: 41.7151, centreLongitude: 44.8271, zoom: 12,
    } });
    put.mockImplementation((_url: string, body: unknown) => Promise.resolve({ data: body }));
    render(<QueryClientProvider client={client()}><MapSettingsPage /></QueryClientProvider>);
    const zoom = await screen.findByDisplayValue('12');
    fireEvent.change(zoom, { target: { value: '14' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]).toEqual(['/api/v1/gis/map-settings', expect.objectContaining({ centreLatitude: 41.7151, zoom: 14 })]);
  });
});
