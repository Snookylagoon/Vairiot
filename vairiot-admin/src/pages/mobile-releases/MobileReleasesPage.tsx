import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  useMobileReleases,
  useUploadMobileRelease,
  usePatchMobileRelease,
  useDeleteMobileRelease,
  downloadMobileRelease,
} from '@/hooks/useMobileReleases';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MobileReleasesPage() {
  const { data: releases, isLoading } = useMobileReleases();
  const upload = useUploadMobileRelease();
  const patch = usePatchMobileRelease();
  const del = useDeleteMobileRelease();

  const [apk, setApk] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState('');
  const [versionName, setVersionName] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [setCurrent, setSetCurrent] = useState(true);

  const resetForm = () => {
    setApk(null); setVersionCode(''); setVersionName('');
    setReleaseNotes(''); setMandatory(false); setSetCurrent(true);
  };

  const handleUpload = async () => {
    if (!apk || !versionCode || !versionName.trim()) return;
    await upload.mutateAsync({
      apk,
      versionCode: Number(versionCode),
      versionName: versionName.trim(),
      releaseNotes: releaseNotes.trim() || undefined,
      mandatory,
      setCurrent,
    });
    resetForm();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Mobile Releases</h1>
        <span className="text-sm text-gray-500">
          Devices poll <code>/api/v1/mobile/version</code> every 6h — only the 3 most recent releases are kept
        </span>
      </div>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Upload new release</h2>

          <div>
            <label className="text-xs font-medium text-gray-600">APK file</label>
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setApk(e.target.files?.[0] ?? null)}
              className="block mt-1 w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-v-violet file:text-white hover:file:bg-v-violet/90"
            />
            {apk && (
              <p className="mt-1 text-xs text-gray-500">
                {apk.name} — {formatBytes(apk.size)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Version code (integer, must be > previous)"
              type="number" min={1}
              value={versionCode}
              onChange={(e) => setVersionCode(e.target.value)}
              placeholder="2"
            />
            <Input
              label="Version name (display string)"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="1.1.0"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Release notes (optional)</label>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-v-violet focus:outline-none focus:ring-1 focus:ring-v-violet"
              placeholder="Bug fixes and improvements"
            />
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-v-charcoal">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={setCurrent} onChange={(e) => setSetCurrent(e.target.checked)} />
              Set as current (devices will start picking this up immediately)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
              Mandatory (block app usage until installed)
            </label>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleUpload}
              loading={upload.isPending}
              disabled={!apk || !versionCode || !versionName.trim()}
            >
              Upload release
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Release history</h2>

          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && (!releases || releases.length === 0) && (
            <p className="text-sm text-gray-500">No releases uploaded yet.</p>
          )}

          {releases && releases.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Uploaded</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-3 pr-3 font-mono text-xs text-gray-600">{r.versionCode}</td>
                      <td className="py-3 pr-3 font-medium text-v-charcoal">{r.versionName}</td>
                      <td className="py-3 pr-3 text-gray-500">{formatBytes(r.sizeBytes)}</td>
                      <td className="py-3 pr-3 text-gray-500">
                        {new Date(r.uploadedAt).toLocaleString()}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex gap-1 flex-wrap">
                          {r.isCurrent && <Badge variant="green">Current</Badge>}
                          {r.mandatory && <Badge variant="yellow">Mandatory</Badge>}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="ghost"
                            onClick={() => downloadMobileRelease(r)}>
                            Download
                          </Button>
                          {!r.isCurrent && (
                            <Button size="sm" variant="ghost"
                              onClick={() => patch.mutate({ id: r.id, isCurrent: true })}>
                              Set current
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            onClick={() => patch.mutate({ id: r.id, mandatory: !r.mandatory })}>
                            {r.mandatory ? 'Unmark mandatory' : 'Mark mandatory'}
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete release ${r.versionName} (code ${r.versionCode})?`)) {
                                del.mutate(r.id);
                              }
                            }}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
