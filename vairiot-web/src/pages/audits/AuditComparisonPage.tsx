import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, XCircle, Equal, ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { api } from '@/lib/api';

interface ComparisonAsset {
  assetId: string;
  assetNumber: string;
  name: string;
  firstClassification: string | null;
  secondClassification: string | null;
  agreement: boolean;
  firstLocationId: string | null;
  secondLocationId: string | null;
  firstCondition: string | null;
  secondCondition: string | null;
}

interface ComparisonSurplus {
  tagValue: string;
  inFirst: boolean;
  inSecond: boolean;
  agreement: boolean;
}

interface ComparisonData {
  firstCampaign: { id: string; name: string };
  secondCampaign: { id: string; name: string };
  agreementRate: number;
  totalItems: number;
  agreements: number;
  disagreements: number;
  assets: ComparisonAsset[];
  surplus: ComparisonSurplus[];
}

const classLabel: Record<string, string> = {
  verified: 'Verified',
  misplaced: 'Misplaced',
  missing: 'Missing',
  surplus: 'Surplus',
  condition_variance: 'Condition variance',
};

export function AuditComparisonPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showOnly, setShowOnly] = useState<'all' | 'agree' | 'disagree'>('all');

  const { data, isLoading } = useQuery<ComparisonData>({
    queryKey: ['audit-comparison', id],
    queryFn: () => api.get(`/api/v1/audits/${id}/comparison`).then(r => r.data),
  });

  const filteredAssets = data?.assets.filter(a =>
    showOnly === 'all' ? true : showOnly === 'agree' ? a.agreement : !a.agreement,
  ) ?? [];

  const filteredSurplus = data?.surplus.filter(s =>
    showOnly === 'all' ? true : showOnly === 'agree' ? s.agreement : !s.agreement,
  ) ?? [];

  const rateColour = (data?.agreementRate ?? 100) >= 90
    ? 'text-green-700' : (data?.agreementRate ?? 100) >= 70
    ? 'text-amber-700' : 'text-red-700';

  return (
    <div className="max-w-5xl space-y-5">
      <button onClick={() => navigate('/audits')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <div className="flex items-center gap-3">
        <ArrowLeftRight size={20} className="text-v-violet" />
        <h1 className="text-2xl font-bold text-v-charcoal">Double-blind comparison</h1>
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>}

      {data && (
        <>
          <Card>
            <CardBody className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Count 1</p>
                <p className="mt-0.5 text-sm font-semibold text-v-charcoal">{data.firstCampaign.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Count 2</p>
                <p className="mt-0.5 text-sm font-semibold text-v-charcoal">{data.secondCampaign.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Agreement</p>
                <p className={`mt-0.5 text-2xl font-bold ${rateColour}`}>{data.agreementRate}%</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Agree</p>
                <p className="mt-0.5 text-2xl font-bold text-green-700">{data.agreements}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Disagree</p>
                <p className="mt-0.5 text-2xl font-bold text-red-700">{data.disagreements}</p>
              </div>
            </CardBody>
          </Card>

          <div className="flex gap-2">
            {(['all', 'agree', 'disagree'] as const).map(f => (
              <button key={f} type="button" onClick={() => setShowOnly(f)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${showOnly === f
                  ? 'border-v-violet bg-v-violet/5 text-v-violet font-medium'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {f === 'all' ? 'All' : f === 'agree' ? 'Agreements' : 'Disagreements'}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="font-semibold text-v-charcoal text-sm">
              Assets ({filteredAssets.length})
            </CardHeader>
            <CardBody className="divide-y divide-gray-50">
              {filteredAssets.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">No items match this filter.</p>
              )}
              {filteredAssets.map(a => (
                <div key={a.assetId} className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {a.agreement
                        ? <Equal size={14} className="text-green-600" />
                        : <XCircle size={14} className="text-red-600" />}
                      <span className="font-mono text-sm text-v-violet">{a.assetNumber}</span>
                      <span className="text-sm text-v-charcoal">{a.name}</span>
                    </div>
                    {a.agreement
                      ? <Badge label="Agree" variant="active" />
                      : <Badge label="Disagree" variant="inactive" />}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2 ml-6 text-xs text-gray-500">
                    <div>
                      <span className="font-medium">Count 1:</span>{' '}
                      {a.firstClassification ? classLabel[a.firstClassification] ?? a.firstClassification : '—'}
                    </div>
                    <div>
                      <span className="font-medium">Count 2:</span>{' '}
                      {a.secondClassification ? classLabel[a.secondClassification] ?? a.secondClassification : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {filteredSurplus.length > 0 && (
            <Card>
              <CardHeader className="font-semibold text-v-charcoal text-sm">
                Surplus tags ({filteredSurplus.length})
              </CardHeader>
              <CardBody className="divide-y divide-gray-50">
                {filteredSurplus.map(s => (
                  <div key={s.tagValue} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      {s.agreement
                        ? <CheckCircle2 size={14} className="text-green-600" />
                        : <XCircle size={14} className="text-red-600" />}
                      <span className="font-mono text-sm">{s.tagValue}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Count 1: {s.inFirst ? 'Yes' : 'No'}</span>
                      <span>Count 2: {s.inSecond ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
