import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Plus, SearchX, Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

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

export function AuditRunPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const qc          = useQueryClient();

  const [tag,          setTag]          = useState('');
  const [recentScans,  setRecentScans]  = useState<ScanEvent[]>([]);
  const [foundCount,   setFoundCount]   = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [report,       setReport]       = useState<Report | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const recordScan = useMutation({
    mutationFn: (tagValue: string) =>
      api.post(`/api/v1/audits/${id}/scans`, { tagValue }).then(r => r.data as ScanEvent),
    onSuccess: (ev) => {
      setRecentScans(prev => [ev, ...prev].slice(0, 20));
      if (ev.result === 'found')   setFoundCount(c => c + 1);
      if (ev.result === 'unknown') setUnknownCount(c => c + 1);
      setTag('');
      setError(null);
    },
    onError: (e: Error) => setError(e.message ?? 'Failed to record scan'),
  });

  const complete = useMutation({
    mutationFn: () => api.post(`/api/v1/audits/${id}/complete`).then(r => r.data as Report),
    onSuccess: (r) => { setReport(r); qc.invalidateQueries({ queryKey: ['audits'] }); },
    onError:   (e: Error) => setError(e.message ?? 'Failed to complete'),
  });

  if (report) return <ReportView report={report} onBack={() => navigate('/audits')} />;

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate('/audits')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-v-charcoal">Run audit</h1>
        <p className="text-sm text-gray-500">
          Found <span className="font-semibold text-v-charcoal">{foundCount}</span> · Unknown <span className="font-semibold text-v-charcoal">{unknownCount}</span>
        </p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Scan or type tag value"
              value={tag}
              onChange={e => setTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) recordScan.mutate(tag.trim()); }}
              className="flex-1"
            />
            <Button
              onClick={() => recordScan.mutate(tag.trim())}
              loading={recordScan.isPending}
              disabled={!tag.trim()}
            >
              <Plus size={15} className="mr-1.5" /> Record
            </Button>
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
                {s.result === 'found'
                  ? <CheckCircle2 size={15} className="text-green-600" />
                  : <SearchX size={15} className="text-amber-600" />}
                <span className="font-mono text-sm">{s.tagValue}</span>
              </div>
              <Badge label={s.result.toUpperCase()} variant={s.result === 'found' ? 'active' : 'default'} />
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

function ReportView({ report, onBack }: { report: Report; onBack: () => void }) {
  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to audits
      </button>

      <h1 className="text-2xl font-bold text-v-charcoal">Audit complete</h1>

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
