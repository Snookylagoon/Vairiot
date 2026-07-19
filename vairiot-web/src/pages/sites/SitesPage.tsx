import { Plus, MapPin, Trash2, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CountrySelect } from '@/components/ui/CountrySelect';
import { Input } from '@/components/ui/Input';
import { useSites, useCreateSite, useDeleteSite } from '@/hooks/useSites';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

export function SitesPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'site:write');
  const { data: sites = [], isLoading } = useSites();
  const createSite = useCreateSite();
  const deleteSite = useDeleteSite();
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter((s: { name: string; city?: string; country?: string }) =>
      s.name.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q) || s.country?.toLowerCase().includes(q));
  }, [sites, search]);

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
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to create site.');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Sites</h1>
        <p className="text-sm text-gray-500 mt-1">Manage locations where assets are deployed.</p>
      </div>

      {canWrite && (
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
              <CountrySelect label="Country" value={form.country}
                onChange={v => set('country', v)} />
            </div>
            <Button onClick={handleCreate} loading={createSite.isPending}>
              <Plus size={15} className="mr-1.5" /> Add Site
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search sites…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink" />
      </div>

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {filtered.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <MapPin size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">{search ? 'No matching sites.' : 'No sites yet — add one above.'}</p>
            </div>
          )}
          {filtered.map((s: { id: string; name: string; city?: string; country?: string; _count?: { assets: number } }) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <button
                type="button"
                onClick={() => navigate(`/assets?siteId=${s.id}`)}
                className="flex-1 text-left rounded-md -mx-2 px-2 py-1 hover:bg-v-wash transition-colors"
                title={`View assets at ${s.name}`}>
                <p className="text-sm font-medium text-v-charcoal">{s.name}</p>
                {(s.city || s.country) && (
                  <p className="text-xs text-gray-400">{[s.city, s.country].filter(Boolean).join(', ')}</p>
                )}
                <p className="text-xs text-v-mauve mt-0.5">{s._count?.assets ?? 0} assets</p>
              </button>
              {canWrite && (
                <button onClick={() => setDeleteId(s.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Site"
        description="This site and its locations will be permanently deleted. Assets assigned to this site will become unassigned."
        confirmLabel="Delete"
        loading={deleteSite.isPending}
        onConfirm={() => { if (deleteId) { deleteSite.mutate(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
