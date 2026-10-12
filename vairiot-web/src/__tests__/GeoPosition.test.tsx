import { zodResolver } from '@hookform/resolvers/zod';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { AssetGeoPosition } from '@/components/assets/AssetGeoPosition';
import { GeoPositionFields } from '@/components/forms/GeoPositionFields';
import { geoPayload } from '@/lib/geo';
import { assetSchema, type AssetFormData } from '@/lib/schemas';
import type { Asset } from '@/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({ defaults, onSubmit }: { defaults?: Partial<AssetFormData>; onSubmit: (d: AssetFormData) => void }) {
  const { register, setValue, watch, handleSubmit, formState: { errors } } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema), defaultValues: { name: 'Pump', ...defaults },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <GeoPositionFields register={register} setValue={setValue} watch={watch} errors={errors} />
      <button type="submit">Save</button>
    </form>
  );
}

const paste = (el: HTMLElement, text: string) =>
  fireEvent.paste(el, { clipboardData: { getData: () => text } });

describe('GeoPositionFields', () => {
  it('fills both fields from a pasted map link and shows a map', async () => {
    render(<Harness onSubmit={vi.fn()} />);
    paste(screen.getByPlaceholderText('e.g. 41.715100'), 'https://www.google.com/maps/@41.7151,44.8271,17z');
    expect(screen.getByPlaceholderText('e.g. 41.715100')).toHaveValue('41.7151');
    expect(screen.getByPlaceholderText('e.g. 44.827100')).toHaveValue('44.8271');
    await waitFor(() => expect(screen.getByTitle('Map at 41.7151, 44.8271')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('blocks submit when only one coordinate is entered', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 41.715100'), { target: { value: '41.7' } });
    await act(async () => { fireEvent.click(screen.getByText('Save')); });
    expect(await screen.findByText('Enter both latitude and longitude')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('captures the device position with its accuracy', async () => {
    const onSubmit = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: PositionCallback) => ok({
        coords: { latitude: 41.71512345, longitude: 44.82712345, accuracy: 7.42 },
        timestamp: Date.parse('2026-10-12T09:00:00Z'),
      } as GeolocationPosition) },
    });
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Use my location'));
    expect(screen.getByText('Captured from this device, accurate to ±7.4 m.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText('Save')); });
    expect(geoPayload(onSubmit.mock.calls[0][0])).toEqual({
      latitude: 41.715123, longitude: 44.827123, geoAccuracyMeters: 7.4, geoSource: 'device',
      geoCapturedAt: '2026-10-12T09:00:00.000Z',
    });
  });

  it('clears the position to nulls', async () => {
    const onSubmit = vi.fn();
    render(<Harness defaults={{ latitude: '41.7', longitude: '44.8', geoSource: 'device', geoAccuracyMeters: '5' }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Clear'));
    await act(async () => { fireEvent.click(screen.getByText('Save')); });
    expect(geoPayload(onSubmit.mock.calls[0][0])).toEqual({
      latitude: null, longitude: null, geoAccuracyMeters: null, geoSource: null, geoCapturedAt: null,
    });
  });
});

describe('AssetGeoPosition', () => {
  const base = { id: 'a1', assetNumber: 'AST-000001', name: 'Pump', status: 'active', condition: 'good', createdAt: '', updatedAt: '' } as Asset;

  it('shows coordinates, accuracy, source and map links', () => {
    render(<AssetGeoPosition asset={{ ...base, latitude: 41.7151, longitude: 44.8271, geoAccuracyMeters: 6, geoSource: 'device' }} />);
    expect(screen.getByText('41.715100, 44.827100')).toBeInTheDocument();
    expect(screen.getByText('±6 m')).toBeInTheDocument();
    expect(screen.getByText('Captured from device')).toBeInTheDocument();
    expect(screen.getByText('Open in Google Maps').closest('a')).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=41.7151,44.8271');
  });

  it('says when there is no position', () => {
    render(<AssetGeoPosition asset={base} />);
    expect(screen.getByText(/No map position recorded/)).toBeInTheDocument();
  });
});
