import { Crosshair, MapPinned, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { parseCoordinates, type GeoPosition } from 'vairiot-shared';

import { MapPreview } from '@/components/geo/MapPreview';
import { PositionPickerMap } from '@/components/geo/PositionPickerMap';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formPosition } from '@/lib/geo';
import type { AssetFormData } from '@/lib/schemas';

interface GeoPositionFieldsProps {
  register: UseFormRegister<AssetFormData>;
  setValue: UseFormSetValue<AssetFormData>;
  watch:    UseFormWatch<AssetFormData>;
  errors:   FieldErrors<AssetFormData>;
}

const GEO_ERRORS: Record<number, string> = {
  1: 'Location permission was denied in the browser',
  2: 'Your position could not be determined',
  3: 'Timed out waiting for a position fix',
};

/** Latitude / longitude entry with device capture, paste parsing and a map preview. */
export function GeoPositionFields({ register, setValue, watch, errors }: GeoPositionFieldsProps) {
  const latitude  = watch('latitude');
  const longitude = watch('longitude');
  const accuracy  = watch('geoAccuracyMeters');
  const source    = watch('geoSource');
  const [locating, setLocating] = useState(false);
  // "Set position" by clicking or dragging on a map (stage 1.11).
  const [picking, setPicking] = useState(false);

  // Let typing settle before reloading the map.
  const [preview, setPreview] = useState<GeoPosition | null>(() => formPosition(latitude, longitude));
  useEffect(() => {
    const t = setTimeout(() => setPreview(formPosition(latitude, longitude)), 600);
    return () => clearTimeout(t);
  }, [latitude, longitude]);

  const setPosition = (lat: number | string, lng: number | string, meta: { accuracy?: number; source: string; capturedAt?: string }) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue('latitude', String(lat), opts);
    setValue('longitude', String(lng), opts);
    setValue('geoAccuracyMeters', meta.accuracy != null ? String(Math.round(meta.accuracy * 10) / 10) : '');
    setValue('geoSource', meta.source);
    setValue('geoCapturedAt', meta.capturedAt ?? '');
  };

  // A hand-typed coordinate is no longer the device fix it may have started as.
  const markManual = () => {
    setValue('geoSource', 'manual');
    setValue('geoAccuracyMeters', '');
    setValue('geoCapturedAt', '');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = parseCoordinates(e.clipboardData.getData('text'));
    if (!parsed) return;
    e.preventDefault();
    setPosition(parsed.latitude, parsed.longitude, { source: 'manual' });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot provide a location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPosition(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6), {
          accuracy: pos.coords.accuracy, source: 'device', capturedAt: new Date(pos.timestamp).toISOString(),
        });
        toast.success(`Position captured (±${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(GEO_ERRORS[err.code] ?? 'Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const clear = () => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue('latitude', '', opts);
    setValue('longitude', '', opts);
    markManual();
  };

  const hint = 'Decimal degrees (WGS 84). Paste "lat, lng" or a Google Maps / OpenStreetMap link.';

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">GIS Position</h3>
          <p className="text-xs text-gray-400 mt-0.5">Map coordinates, in addition to the site and location above</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant={picking ? 'primary' : 'ghost'} size="sm" onClick={() => setPicking(p => !p)}>
            <MapPinned size={14} className="mr-1" /> {picking ? 'Done' : 'Pick on map'}
          </Button>
          {(latitude || longitude) && (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X size={14} className="mr-1" /> Clear
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" loading={locating} onClick={useCurrentLocation}>
            {!locating && <Crosshair size={14} className="mr-1" />} Use my location
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Latitude" inputMode="decimal" placeholder="e.g. 41.715100"
          error={errors.latitude?.message} hint={hint}
          onPaste={handlePaste}
          {...register('latitude', { onChange: markManual })} />
        <Input label="Longitude" inputMode="decimal" placeholder="e.g. 44.827100"
          error={errors.longitude?.message}
          onPaste={handlePaste}
          {...register('longitude', { onChange: markManual })} />
      </div>
      {source === 'device' && accuracy && (
        <p className="text-xs text-gray-500">Captured from this device, accurate to ±{accuracy} m.</p>
      )}
      {picking ? (
        <>
          <p className="text-xs text-gray-500">Click the map or drag the pin to set the position. It is saved as entered by hand.</p>
          <PositionPickerMap
            position={formPosition(latitude, longitude)}
            onPick={(p) => setPosition(p.latitude.toFixed(6), p.longitude.toFixed(6), { source: 'manual' })}
          />
        </>
      ) : preview && <MapPreview position={preview} />}
    </div>
  );
}
