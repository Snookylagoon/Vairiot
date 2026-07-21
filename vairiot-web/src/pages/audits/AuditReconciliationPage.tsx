import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, MapPin, Ghost, Package, AlertTriangle, Send } from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

interface SnapshotAsset {
  id: string;
  assetId: string;
  assetNumber: string;
  name: string;
  locationId?: string;
  condition?: string;
}

interface ScanEvent {
  id: string;
  tagValue: string;
  locationId?: string;
  condition?: string;
  scannedAt: string;
}

interface ReconciliationItem {
  id: string;
  campaignId: string;
  snapshotAssetId?: string;
  scanEventId?: string;
  classification: string;
  snapshotLocationId?: string;
  foundLocationId?: string;
  snapshotCondition?: string;
  foundCondition?: string;
  notes?: string;
  snapshotAsset?: SnapshotAsset;
  scanEvent?: ScanEvent;
}

interface Adjustment {
  id: string;
  adjustmentType: string;
  fieldChanged?: string;
  valueBefore?: string;
  valueAfter?: string;
  justification: string;
  postedBy: string;
  postedAt: string;
  appliedToRegister: boolean;
}

const classificationConfig: Record<string, { label: string; colour: string; bgColour: string; Icon: React.ElementType }> = {
  verified:           { label: 'Verified',           colour: 'text-green-700',  bgColour: 'bg-green-50',  Icon: CheckCircle2 },
  misplaced:          { label: 'Misplaced',          colour: 'text-amber-700',  bgColour: 'bg-amber-50',  Icon: MapPin },
  missing:            { label: 'Missing',            colour: 'text-red-700',    bgColour: 'bg-red-50',    Icon: Ghost },
  surplus:            { label: 'Surplus',            colour: 'text-blue-700',   bgColour: 'bg-blue-50',   Icon: Package },
  condition_variance: { label: 'Condition variance', colour: 'text-orange-700', bgColour: 'bg-orange-50', Icon: AlertTriangle },
};

const CLASSIFICATIONS = ['verified', 'misplaced', 'missing', 'surplus', 'condition_variance'];

export function AuditReconciliationPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const canApprove = hasAnyPermission(user, 'audit:approve');

  const [filter, setFilter] = useState('');

  const { data: items = [], isLoading } = useQuery<ReconciliationItem[]>({
    queryKey: ['audit-reconciliation', id],
    queryFn:  () => api.get(`/api/v1/audits/${id}/reconciliation`).then(r => r.data),
  });

  const { data: adjustments = [] } = useQuery<Adjustment[]>({
    queryKey: ['audit-adjustments', id],
    queryFn:  () => api.get(`/api/v1/audits/${id}/adjustments`).then(r => r.data),
  });

  const filtered = filter ? items.filter(i => i.classification === filter) : items;

  const counts = CLASSIFICATIONS.reduce<Record<string, number>>((acc, c) => {
    acc[c] = items.filter(i => i.classification === c).length;
    return acc;
  }, {});

  return (
    <div className="max-w-5xl space-y-5">
      <button onClick={() => navigate('/audits')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <h1 className="text-2xl font-bold text-v-charcoal">Reconciliation</h1>

      <Card>
        <CardBody className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {CLASSIFICATIONS.map(c => {
            const cfg = classificationConfig[c];
            return (
              <button key={c} type="button" onClick={() => setFilter(filter === c ? '' : c)}
                className={`text-left rounded-lg p-3 transition-colors ${filter === c ? cfg.bgColour + ' ring-2 ring-offset-1 ring-current ' + cfg.colour : 'hover:bg-gray-50'}`}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{cfg.label}</p>
                <p className={`mt-0.5 text-2xl font-bold ${cfg.colour}`}>{counts[c] ?? 0}</p>
              </button>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-semibold text-v-charcoal text-sm">
          {filter ? classificationConfig[filter]?.label ?? 'Items' : 'All items'}
          <span className="ml-2 text-gray-400 font-normal">({filtered.length})</span>
        </CardHeader>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No items.</p>
          )}
          {filtered.map(item => (
            <ReconciliationRow
              key={item.id}
              item={item}
              campaignId={id}
              canApprove={canApprove}
              adjustments={adjustments.filter(a => a.id === item.id)}
              onAdjusted={() => {
                qc.invalidateQueries({ queryKey: ['audit-adjustments', id] });
                qc.invalidateQueries({ queryKey: ['audit-reconciliation', id] });
              }}
            />
          ))}
        </CardBody>
      </Card>

      {adjustments.length > 0 && (
        <Card>
          <CardHeader className="font-semibold text-v-charcoal text-sm">
            Adjustment history ({adjustments.length})
          </CardHeader>
          <CardBody className="divide-y divide-gray-50">
            {adjustments.map(a => (
              <div key={a.id} className="py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge label={a.adjustmentType.replace(/_/g, ' ')} variant="default" />
                  {a.appliedToRegister && <Badge label="Applied" variant="active" />}
                </div>
                {a.fieldChanged && (
                  <p className="text-xs text-gray-500 mt-1">
                    {a.fieldChanged}: <span className="line-through text-red-500">{a.valueBefore ?? '—'}</span>
                    {' → '}<span className="text-green-600">{a.valueAfter ?? '—'}</span>
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{a.justification}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(a.postedAt).toLocaleString('en-GB')}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function ReconciliationRow({
  item, campaignId, canApprove, onAdjusted,
}: {
  item: ReconciliationItem;
  campaignId: string;
  canApprove: boolean;
  adjustments: Adjustment[];
  onAdjusted: () => void;
}) {
  const cfg = classificationConfig[item.classification] ?? classificationConfig.verified;
  const [showForm, setShowForm] = useState(false);
  const [adjType, setAdjType]     = useState('no_action');
  const [field, setField]         = useState('');
  const [value, setValue]         = useState('');
  const [justification, setJustification] = useState('');
  const [applyToRegister, setApplyToRegister] = useState(false);

  const postAdj = useMutation({
    mutationFn: () => api.post(`/api/v1/audits/${campaignId}/adjustments`, {
      reconciliationItemId: item.id,
      adjustmentType: adjType,
      ...(field ? { fieldChanged: field } : {}),
      ...(value ? { valueAfter: value } : {}),
      justification,
      applyToRegister,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Adjustment posted');
      setShowForm(false);
      setAdjType('no_action'); setField(''); setValue(''); setJustification(''); setApplyToRegister(false);
      onAdjusted();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to post adjustment'),
  });

  return (
    <div className="py-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded-md ${cfg.bgColour}`}>
            <cfg.Icon size={14} className={cfg.colour} />
          </div>
          <div>
            {item.snapshotAsset && (
              <p className="text-sm font-medium text-v-charcoal">
                <span className="font-mono text-v-violet mr-2">{item.snapshotAsset.assetNumber}</span>
                {item.snapshotAsset.name}
              </p>
            )}
            {!item.snapshotAsset && item.scanEvent && (
              <p className="text-sm font-medium text-v-charcoal">
                Unregistered tag: <span className="font-mono">{item.scanEvent.tagValue}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
              <Badge label={cfg.label} variant="default" />
              {item.snapshotLocationId && (
                <span>Expected location: {item.snapshotLocationId}</span>
              )}
              {item.foundLocationId && item.foundLocationId !== item.snapshotLocationId && (
                <span className="text-amber-600">Found at: {item.foundLocationId}</span>
              )}
              {item.snapshotCondition && (
                <span>Expected condition: {item.snapshotCondition}</span>
              )}
              {item.foundCondition && item.foundCondition !== item.snapshotCondition && (
                <span className="text-orange-600">Found condition: {item.foundCondition}</span>
              )}
            </div>
          </div>
        </div>
        {canApprove && item.classification !== 'verified' && (
          <Button size="sm" variant="secondary" onClick={() => setShowForm(!showForm)}>
            Adjust
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mt-3 ml-10 p-3 rounded-lg bg-gray-50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Adjustment type</label>
              <select value={adjType} onChange={e => setAdjType(e.target.value)}
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="no_action">No action</option>
                <option value="update_location">Update location</option>
                <option value="update_condition">Update condition</option>
                <option value="write_off">Write off</option>
                <option value="register_new">Register new asset</option>
              </select>
            </div>
            {(adjType === 'update_location' || adjType === 'update_condition') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Field</label>
                  <input value={field} onChange={e => setField(e.target.value)}
                    placeholder={adjType === 'update_location' ? 'locationId' : 'condition'}
                    className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">New value</label>
                  <input value={value} onChange={e => setValue(e.target.value)}
                    className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
                </div>
              </>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Justification *</label>
            <textarea value={justification} onChange={e => setJustification(e.target.value)}
              rows={2} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`apply-${item.id}`} checked={applyToRegister}
              onChange={e => setApplyToRegister(e.target.checked)} />
            <label htmlFor={`apply-${item.id}`} className="text-xs text-gray-600">
              Apply change to the asset register
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => postAdj.mutate()} loading={postAdj.isPending}
              disabled={!justification.trim()}>
              <Send size={13} className="mr-1" /> Post adjustment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
