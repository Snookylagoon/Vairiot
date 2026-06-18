import { useState } from 'react';
import { Plus, MapPin } from 'lucide-react';
import { useSites, useCreateSite } from '@/hooks/useSites';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

export function SitesPage() {
  const { data: sites = [], isLoading } = useSites();
  const createSite = useCreateSite();
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Site name is required'); return; }
    try {
      setError('');
      await createSite.mutateAsync({
        name:    form.name.trim(),
        address: form.address.trim() || undefined,
        city:    form.city.trim()    || undefined,
        country: form.country.trim() || undefined,
      });
      setForm({ name: '', address: '', city: '', country: '' });
    } catch { setError('Failed to create site.'); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Sites</h1>
        <p className="text-sm text-gray-500 mt-1">Manage locations where assets are deployed.</p>
      </div>

      {/* Add new */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-v-charcoal text-sm">Add New Site</h3>
          <Input label="Site Name *" placeholder="e.g. Head Office" value={form.name}
            onChange={e => set('name', e.target.value)} error={error} />
          <Input label="Address"     placeholder="Street address"   value={form.address}
            onChange={e => set('address', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City"    placeholder="City"    value={form.city}
              onChange={e => set('city', e.target.value)} />
            <Input label="Country" placeholder="Country" value={form.country}
              onChange={e => set('country', e.target.value)} />
          </div>
          <Button onClick={handleCreate} loading={createSite.isPending}>
            <Plus size={15} className="mr-1.5" /> Add Site
          </Button>
        </CardBody>
      </Card>

      {/* List */}
      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {sites.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <MapPin size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No sites yet — add one above.</p>
            </div>
          )}
          {sites.map((s: { id: string; name: string; city?: string; country?: string; _count?: { assets: number } }) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-v-charcoal">{s.name}</p>
                {(s.city || s.country) && (
                  <p className="text-xs text-gray-400">{[s.city, s.country].filter(Boolean).join(', ')}</p>
                )}
                <p className="text-xs text-v-mauve mt-0.5">{s._count?.assets ?? 0} assets</p>
              </div>
              <MapPin size={15} className="text-gray-300" />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
