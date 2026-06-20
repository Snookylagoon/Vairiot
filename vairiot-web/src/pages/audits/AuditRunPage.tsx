import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Plus, SearchX, Flag, Download, Lock, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface Campaign {
  id: string;
  name: string;
  mode: string;
  status: string;
  siteId?: string;
}

interface ScanEvent {
  id:        string;
  tagValue:  string;
  result:    string;
  scannedAt: string;
}

interface Report {
  campaignId:    string;
  totalScanned:  number;
  totalExpected: number;
  found:         number;
  missing:       Array<{ id: string; assetNumber: string; name: string }>;
  unknownTags:   string[];
}

interface ZoneSubmission {
  id: string;
  locationId: string;
  submittedBy: string;
  submittedAt: string;
}

export function AuditRunPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const qc          = useQueryClient();

  const [tag,          setTag]          = useState('');
  const [condition,    setCondition]    = useState('');
  const [locationId,   setLocationId]   = useState('');
  const [recentScans,  setRecentScans]  = useState<ScanEvent[]>([]);
  const [foundCount,   setFoundCount]   = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [report,       setReport]       = useState<Report | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ['audit-campaign', id],
    queryFn:  () => api.get(`/api/v1/audits/${id}/report`).then(r => r.data),
  });

  const isBlind = campaign?.mode === 'blind';

  const { data: siteLocations = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['site-locations', campaign?.siteId],
    queryFn:  () => api.get(`/api/v1/sites/${campaign!.siteId}/locations`).then(r => r.data),
    enabled:  !!campaign?.siteId,
  });

  const { data: zoneSubmissions = [], refetch: refetchZones } = useQuery<ZoneSubmission[]>({
    queryKey: ['audit-zones', id],
    queryFn:  () => api.get(`/api/v1/audits/${id}/zones`).then(r => r.data),
    enabled:  isBlind,
  });

  const submittedLocationIds = new Set(zoneSubmissions.map(z => z.locationId));
  const currentZoneLocked = !!locationId && submittedLocationIds.has(locationId);

  const recordScan = useMutation({
    mutationFn: (tagValue: string) =>
      api.post(`/api/v1/audits/${id}/scans`, {
        tagValue,
        ...(isBlind && locationId ? { locationId } : {}),
        ...(condition ? { condition } : {}),
      }).then(r => r.data as ScanEvent),
    onSuccess: (ev) => {
      setRecentScans(prev => [ev, ...prev].slice(0, 20));
      if (ev.result === 'found')    setFoundCount(c => c + 1);
      if (ev.result === 'unknown')  setUnknownCount(c => c + 1);
      if (ev.result === 'recorded') setRecordedCount(c => c + 1);
      setTag('');
      setCondition('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message ?? 'Failed to record scan'),
  });

  const submitZone = useMutation({
    mutationFn: () => api.post(`/api/v1/audits/${id}/zones/${locationId}/submit`).then(r => r.data),
    onSuccess: () => {
      refetchZones();
      toast.success('Zone submitted and locked');
    },
    onError: (e: Error) => setError(e.message ?? 'Failed to submit zone'),
  });

  const complete = useMutation({
    mutationFn: () => api.post(`/api/v1/audits/${id}/complete`).then(r => r.data as Report),
    onSuccess: (r) => { setReport(r); qc.invalidateQueries({ queryKey: ['audits'] }); },
    onError:   (e: Error) => setError(e.message ?? 'Failed to complete'),
  });

  if (report) return <ReportView report={report} isBlind={isBlind} campaignId={id} onBack={() => navigate('/audits')} />;

  const scanDisabled = isBlind && (!locationId || currentZoneLocked);

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate('/audits')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-v-charcoal">Run audit</h1>
        <p className="text-sm text-gray-500">
          {isBlind
            ? <>Recorded <span className="font-semibold text-v-charcoal">{recordedCount}</span></>
            : <>Found <span className="font-semibold text-v-charcoal">{foundCount}</span> · Unknown <span className="font-semibold text-v-charcoal">{unknownCount}</span></>
          }
        </p>
      </div>

      {isBlind && (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-medium text-v-charcoal">Select zone</p>
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
              <option value="">Choose a location…</option>
              {siteLocations.map(l => (
                <option key={l.id} value={l.id} disabled={submittedLocationIds.has(l.id)}>
                  {l.name}{submittedLocationIds.has(l.id) ? ' (submitted)' : ''}
                </option>
              ))}
            </select>
            {currentZoneLocked && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <Lock size={12} /> This zone has been submitted and is locked.
              </p>
            )}
            {locationId && !currentZoneLocked && (
              <Button size="sm" variant="secondary" onClick={() => submitZone.mutate()} loading={submitZone.isPending}>
                <Lock size={14} className="mr-1.5" /> Submit zone
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Scan or type tag value"
              value={tag}
              onChange={e => setTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && tag.trim() && !scanDisabled) recordScan.mutate(tag.trim()); }}
              className="flex-1"
              disabled={scanDisabled}
            />
            <Button
              onClick={() => recordScan.mutate(tag.trim())}
              loading={recordScan.isPending}
              disabled={!tag.trim() || scanDisabled}
            >
              <Plus size={15} className="mr-1.5" /> Record
            </Button>
          </div>
          <div className="flex gap-2">
            <select value={condition} onChange={e => setCondition(e.target.value)}
              disabled={scanDisabled}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink disabled:bg-gray-50">
              <option value="">Condition (optional)</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-semibold text-v-charcoal text-sm">Recent scans</CardHeader>
        <CardBody className="space-y-1.5">
          {recentScans.length === 0 && <p className="text-sm text-gray-400">No scans recorded yet.</p>}
          {recentScans.map(s => (
            <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                {s.result === 'found' && <CheckCircle2 size={15} className="text-green-600" />}
                {s.result === 'unknown' && <SearchX size={15} className="text-amber-600" />}
                {s.result === 'recorded' && <Radio size={15} className="text-v-violet" />}
                <span className="font-mono text-sm">{s.tagValue}</span>
              </div>
              <Badge
                label={s.result.toUpperCase()}
                variant={s.result === 'found' ? 'active' : s.result === 'recorded' ? 'default' : 'default'}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      <Button onClick={() => complete.mutate()} loading={complete.isPending}>
        <Flag size={15} className="mr-1.5" /> Complete audit
      </Button>
    </div>
  );
}

function ReportView({ report, isBlind, campaignId, onBack }: { report: Report; isBlind: boolean; campaignId: string; onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-v-charcoal">Audit complete</h1>
        <div className="flex gap-2">
          {isBlind && (
            <Button variant="secondary" onClick={() => navigate(`/audits/${campaignId}/reconciliation`)}>
              View reconciliation
            </Button>
          )}
          <Button variant="secondary" onClick={async () => {
            const r = await api.get(`/api/v1/audits/${report.campaignId}/export.csv`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = url; a.download = `audit-${report.campaignId.slice(0,8)}.csv`;
            a.click(); URL.revokeObjectURL(url);
          }}>
            <Download size={16} className="mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Expected" value={report.totalExpected} />
          <Stat label="Scanned"  value={report.totalScanned} />
          <Stat label="Found"    value={report.found} />
          <Stat label="Missing"  value={report.missing.length} />
          <Stat label="Unknown"  value={report.unknownTags.length} />
        </CardBody>
      </Card>

      {report.missing.length > 0 && (
        <Card>
          <CardHeader className="font-semibold text-v-charcoal text-sm">Missing assets</CardHeader>
          <CardBody className="space-y-1.5">
            {report.missing.map(a => (
              <p key={a.id} className="text-sm">
                <span className="font-mono text-v-violet mr-2">{a.assetNumber}</span>
                {a.name}
              </p>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-v-charcoal">{value}</p>
    </div>
  );
}
