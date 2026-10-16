import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { DEFAULT_CONDITION_SCALE } from 'vairiot-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConditionHistory } from '@/components/assets/ConditionHistory';
import { ConditionSelect, normaliseCondition } from '@/components/forms/ConditionSelect';
import { ConditionScalePage } from '@/pages/admin/ConditionScalePage';

// Stage 1.14: graded condition in the web console.

const get = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) } }));

const scale = (label3 = 'Fair') => ({
  source: 'tenant', entries: DEFAULT_CONDITION_SCALE.map(e => (e.grade === 3 ? { ...e, label: label3, criteria: 'Paint faded.' } : e)),
});
const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  get.mockImplementation((path: string) => Promise.resolve({ data:
    path === '/api/v1/condition/scale' ? scale('Worn')
    : path === '/api/v1/condition/photo-rules' ? { defaultMinPhotos: 1, categories: [] }
    : path.endsWith('/gs1') ? { events: [
      { id: 'e1', eventType: 'CREATED', occurredAt: '2026-10-16T08:00:00Z', payload: {} },
      { id: 'e2', eventType: 'CONDITION_ASSESSED', occurredAt: '2026-10-16T09:00:00Z', payload: { fromGrade: 4, toGrade: 3 } },
    ] }
    : [],
  }));
});

function SelectHarness() {
  const { register, watch } = useForm({ defaultValues: { condition: 'fair' } });
  return <ConditionSelect registration={register('condition')} value={watch('condition')} />;
}

describe('ConditionSelect', () => {
  it('lists the tenant’s grades and shows the chosen grade’s criteria', async () => {
    wrap(<SelectHarness />);
    expect(await screen.findByRole('option', { name: '3 · Worn' })).toBeInTheDocument();
    expect(screen.getByText('Paint faded.')).toBeInTheDocument();
  });

  it('maps strings from before the scale onto its options', () => {
    expect(normaliseCondition('excellent')).toBe('new');
    expect(normaliseCondition('Poor')).toBe('poor');
    expect(normaliseCondition(null)).toBe('good');
  });
});

describe('ConditionHistory', () => {
  it('shows each assessment from the ledger', async () => {
    wrap(<ConditionHistory assetId="a1" />);
    expect(await screen.findByText('Condition history')).toBeInTheDocument();
    expect(screen.getByText('3 · Worn')).toBeInTheDocument();
    expect(screen.getByText(/4 · Good →/)).toBeInTheDocument();
  });
});

describe('ConditionScalePage', () => {
  it('saves the edited scale and the photo rules', async () => {
    put.mockImplementation((_u: string, body: unknown) => Promise.resolve({ data: body }));
    wrap(<ConditionScalePage />);
    const label = await screen.findByDisplayValue('Worn');
    fireEvent.change(label, { target: { value: 'Weathered' } });
    fireEvent.click(screen.getByLabelText('Photo required at grade 3'));
    fireEvent.click(screen.getByText('Save scale'));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/api/v1/condition/scale');
    expect(body.categoryId).toBeNull();
    expect(body.entries.find((e: { grade: number }) => e.grade === 3)).toMatchObject({ label: 'Weathered', photoRequired: true });

    fireEvent.click(screen.getByText('Save photo rules'));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1]).toEqual(['/api/v1/condition/photo-rules', { defaultMinPhotos: 1, categories: [] }]);
  });
});
