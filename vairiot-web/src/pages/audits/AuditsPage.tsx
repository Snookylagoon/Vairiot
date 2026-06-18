import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Play, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['audits'],
    queryFn:  () => api.get('/api/v1/audits').then(r => r.data),
  });

  const createCampaign = useMutation({
    mutationFn: (data: { name: string }) => api.post('/api/v1/audits', data).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });

  const startCampaign = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/audits/${id}/start`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });

  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createCampaign.mutateAsync({ name: name.trim() });
    setName('');
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Audit Campaigns</h1>
        <p className="text-sm text-gray-500 mt-1">Create and manage asset audit campaigns.</p>
      </div>

      {/* New campaign */}
      <Card>
        <CardBody className="flex items-end gap-3">
          <div className="flex-1">
            <Input label="New Campaign Name" placeholder="e.g. Q3 2026 Full Audit"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <Button onClick={handleCreate} loading={createCampaign.isPending}>
            <Plus size={15} className="mr-1.5" /> Create
          </Button>
        </CardBody>
      </Card>

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
          {campaigns.map((c: { id: string; name: string; status: string; _count?: { scanEvents: number }; createdAt: string }) => {
            const Icon = statusIcon[c.status] ?? Clock;
            return (
              <div key={c.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-v-wash">
                    <Icon size={16} className="text-v-violet" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-v-charcoal">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {c._count?.scanEvents ?? 0} scans &mdash; {new Date(c.createdAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge label={c.status.replace('_', ' ')} variant={statusVariant[c.status] ?? 'default'} />
                  {c.status === 'draft' && (
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
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
