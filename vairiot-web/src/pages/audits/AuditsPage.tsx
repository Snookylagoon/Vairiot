import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Play, CheckCircle, Clock, ArrowRight, X, EyeOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';
import { useSites } from '@/hooks/useSites';
import { useCategories } from '@/hooks/useCategories';
import { useAssets } from '@/hooks/useAssets';

const statusVariant: Record<string, 'active'|'inactive'|'default'> = {
  draft:       'inactive',
  in_progress: 'active',
  completed:   'default',
};

const statusIcon: Record<string, React.ElementType> = {
  draft:       Clock,
  in_progress: Play,
  completed:   CheckCircle,
};

export function AuditsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'audit:write');
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['audits'],
    queryFn:  () => api.get('/api/v1/audits').then(r => r.data),
  });

  const blindAuditEnabled = user?.featureFlags?.blindAudit === true;

  const createCampaign = useMutation({
    mutationFn: (data: {
      name: string;
      mode?: string;
      siteId?: string;
      locationId?: string;
      categoryId?: string;
      assetIds?: string[];
      linkedCampaignId?: string;
    }) => api.post('/api/v1/audits', data).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['audits'] }); toast.success('Campaign created'); },
    onError:    () => { toast.error('Failed to create campaign'); },
  });

  const startCampaign = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/audits/${id}/start`).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['audits'] }); toast.success('Campaign started'); },
    onError:    () => { toast.error('Failed to start campaign'); },
  });

  const [name, setName]               = useState('');
  const [mode, setMode]               = useState<'sighted' | 'blind'>('sighted');
  const [siteId, setSiteId]           = useState('');
  const [locationId, setLocationId]   = useState('');
  const [categoryId, setCategoryId]   = useState('');
  const [assetIds, setAssetIds]       = useState<string[]>([]);
  const [assetQuery, setAssetQuery]   = useState('');

  const { data: sites = [] }      = useSites();
  const { data: categories = [] } = useCategories();
  // Pull up to 500 active assets for the picker; user filters by typing.
  const { data: assetsData }      = useAssets({ pageSize: 500 });
  const allAssets = assetsData?.assets ?? [];

  const { data: siteLocations = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['site-locations', siteId],
    queryFn:  () => api.get(`/api/v1/sites/${siteId}/locations`).then(r => r.data),
    enabled:  !!siteId,
  });

  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    const pool = allAssets.filter(a => !assetIds.includes(a.id));
    if (!q) return pool.slice(0, 8);
    return pool.filter(a =>
      a.assetNumber.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [allAssets, assetQuery, assetIds]);

  const selectedAssets = useMemo(
    () => allAssets.filter(a => assetIds.includes(a.id)),
    [allAssets, assetIds],
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    const payload: Parameters<typeof createCampaign.mutateAsync>[0] = { name: name.trim() };
    if (mode === 'blind') payload.mode = 'blind';
    if (assetIds.length) {
      payload.assetIds = assetIds;
    } else {
      if (siteId)     payload.siteId     = siteId;
      if (locationId) payload.locationId = locationId;
      if (categoryId) payload.categoryId = categoryId;
    }
    await createCampaign.mutateAsync(payload);
    setName(''); setMode('sighted'); setSiteId(''); setLocationId(''); setCategoryId('');
    setAssetIds([]); setAssetQuery('');
  };

  const scopeIsAssetList = assetIds.length > 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Audit Campaigns</h1>
        <p className="text-sm text-gray-500 mt-1">Create and manage asset audit campaigns.</p>
      </div>

      {canWrite && (
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Input label="New campaign name *" placeholder="e.g. Q3 2026 — Building A"
                value={name} onChange={e => setName(e.target.value)} />
            </div>

            {blindAuditEnabled && (
              <div>
                <p className="text-sm font-medium text-v-charcoal mb-2">Mode</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('sighted')}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${mode === 'sighted' ? 'border-v-violet bg-v-violet/5 text-v-violet font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <Eye size={14} /> Sighted
                  </button>
                  <button type="button" onClick={() => setMode('blind')}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${mode === 'blind' ? 'border-v-pink bg-v-pink/5 text-v-pink font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <EyeOff size={14} /> Blind
                  </button>
                </div>
                {mode === 'blind' && (
                  <p className="text-xs text-gray-500 mt-2">
                    Auditors will not see expected assets during capture. A site must be selected.
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-v-charcoal mb-2">Scope</p>
              <p className="text-xs text-gray-500 mb-3">
                Leave everything blank to audit the whole tenant. Combine site / location / category
                to narrow the expected set — or pick specific assets below to lock the audit to
                exactly those items (asset list overrides the other filters).
              </p>

              <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${scopeIsAssetList ? 'opacity-50 pointer-events-none' : ''}`}>
                <ScopeSelect label="Site" value={siteId} onChange={v => { setSiteId(v); setLocationId(''); }}
                  options={sites.map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }))} />
                <ScopeSelect label="Location" value={locationId} onChange={setLocationId}
                  options={siteLocations.map((l: { id: string; name: string }) => ({ value: l.id, label: l.name }))}
                  disabled={!siteId} disabledHint="Pick a site first" />
                <ScopeSelect label="Category" value={categoryId} onChange={setCategoryId}
                  options={categories.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))} />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-v-charcoal mb-2">
                Specific assets <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </p>
              {selectedAssets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedAssets.map(a => (
                    <span key={a.id}
                      className="inline-flex items-center gap-1 rounded-full bg-v-wash text-xs px-2 py-1">
                      <span className="font-mono text-v-violet">{a.assetNumber}</span>
                      <span className="text-v-charcoal">{a.name}</span>
                      <button type="button"
                        onClick={() => setAssetIds(ids => ids.filter(i => i !== a.id))}
                        className="ml-1 text-gray-400 hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input placeholder="Search assets by number or name…"
                value={assetQuery} onChange={e => setAssetQuery(e.target.value)} />
              {(assetQuery || filteredAssets.length > 0) && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-50">
                  {filteredAssets.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
                  )}
                  {filteredAssets.map(a => (
                    <button key={a.id} type="button"
                      onClick={() => { setAssetIds(ids => [...ids, a.id]); setAssetQuery(''); }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-v-wash">
                      <span className="font-mono text-xs text-v-violet mr-2">{a.assetNumber}</span>
                      <span className="text-v-charcoal">{a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreate} loading={createCampaign.isPending} disabled={!name.trim()}>
                <Plus size={15} className="mr-1.5" /> Create
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Campaign list */}
      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>}
          {campaigns.length === 0 && !isLoading && (
            <div className="py-10 text-center">
              <ClipboardList size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No audit campaigns yet.</p>
            </div>
          )}
          {campaigns.map((c: { id: string; name: string; status: string; mode?: string; linkedCampaignId?: string; linkedFrom?: Array<{ id: string }>; _count?: { scanEvents: number }; createdAt: string }) => {
            const Icon = statusIcon[c.status] ?? Clock;
            const isBlind = c.mode === 'blind';
            const hasSecondCount = (c.linkedFrom ?? []).length > 0;
            const isSecondCount = !!c.linkedCampaignId;
            return (
              <div key={c.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-v-wash">
                    <Icon size={16} className="text-v-violet" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-v-charcoal">{c.name}</p>
                      {isBlind && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-v-pink/10 text-v-pink text-[10px] font-semibold px-1.5 py-0.5">
                          <EyeOff size={10} /> Blind
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c._count?.scanEvents ?? 0} scans &mdash; {new Date(c.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge label={c.status.replace('_', ' ')} variant={statusVariant[c.status] ?? 'default'} />
                  {c.status === 'draft' && canWrite && (
                    <Button size="sm" variant="secondary"
                      loading={startCampaign.isPending}
                      onClick={async () => {
                        await startCampaign.mutateAsync(c.id);
                        navigate(`/audits/${c.id}/run`);
                      }}>
                      Start
                    </Button>
                  )}
                  {(c.status === 'in_progress' || c.status === 'completed') && (
                    <Button size="sm" variant="secondary"
                      onClick={() => navigate(`/audits/${c.id}/run`)}>
                      {c.status === 'completed' ? 'Report' : 'Run'} <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                  {c.status === 'completed' && isBlind && (
                    <Button size="sm" variant="secondary"
                      onClick={() => navigate(`/audits/${c.id}/reconciliation`)}>
                      Reconciliation <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                  {c.status === 'completed' && isBlind && canWrite && !hasSecondCount && !isSecondCount && (
                    <Button size="sm" variant="secondary"
                      loading={createCampaign.isPending}
                      onClick={async () => {
                        const second = await createCampaign.mutateAsync({
                          name: `${c.name} — Count 2`,
                          mode: 'blind',
                          linkedCampaignId: c.id,
                        });
                        toast.success('Second count created');
                        navigate(`/audits/${second.id}/run`);
                      }}>
                      Second count
                    </Button>
                  )}
                  {c.status === 'completed' && isBlind && (hasSecondCount || isSecondCount) && (
                    <Button size="sm" variant="secondary"
                      onClick={() => navigate(`/audits/${c.id}/comparison`)}>
                      Comparison <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}

interface ScopeSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  disabledHint?: string;
}
function ScopeSelect({ label, value, onChange, options, disabled, disabledHint }: ScopeSelectProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink disabled:bg-gray-50">
        <option value="">{disabled && disabledHint ? disabledHint : 'All'}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
