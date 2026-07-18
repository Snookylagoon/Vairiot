import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import {
  useIosReleases,
  useUploadIosRelease,
  usePatchIosRelease,
  useDeleteIosRelease,
  useDownloadIosRelease,
  useIosDevices,
  usePatchIosDevice,
  useDeleteIosDevice,
} from '@/hooks/useIosReleases';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const API_ORIGIN = api.defaults.baseURL || window.location.origin;
const INSTALL_URL = `${API_ORIGIN}/api/v1/ios/install`;
const UDID_URL = `${API_ORIGIN}/api/v1/ios/udid`;

function CopyLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600 w-36 shrink-0">{label}</span>
      <code className="text-xs bg-gray-100 rounded px-2 py-1 truncate">{url}</code>
      <button
        type="button"
        className="p-1 text-gray-400 hover:text-v-violet"
        onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied'); }}
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

export function IosReleasesPage() {
  const { data: releases, isLoading } = useIosReleases();
  const { data: devices, isLoading: devicesLoading } = useIosDevices();
  const upload = useUploadIosRelease();
  const patch = usePatchIosRelease();
  const del = useDeleteIosRelease();
  const download = useDownloadIosRelease();
  const patchDevice = usePatchIosDevice();
  const delDevice = useDeleteIosDevice();

  const [ipa, setIpa] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState('');
  const [versionName, setVersionName] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [setCurrent, setSetCurrent] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const resetForm = () => {
    setIpa(null); setVersionCode(''); setVersionName('');
    setReleaseNotes(''); setSetCurrent(true);
  };

  const handleUpload = async () => {
    if (!ipa || !versionCode || !versionName.trim()) return;
    await upload.mutateAsync({
      ipa,
      versionCode: Number(versionCode),
      versionName: versionName.trim(),
      releaseNotes: releaseNotes.trim() || undefined,
      setCurrent,
    });
    resetForm();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">iOS Releases</h1>
        <span className="text-sm text-gray-500">
          Ad Hoc distribution — devices must be enrolled and registered with Apple before installs work
        </span>
      </div>

      <Card>
        <div className="p-6 space-y-3">
          <h2 className="text-lg font-semibold text-v-charcoal">Share with users</h2>
          <CopyLink label="Install page" url={INSTALL_URL} />
          <CopyLink label="Device enrollment" url={UDID_URL} />
          <p className="text-xs text-gray-500">
            Users must open these in Safari on their iPhone. New devices appear in the table below after
            enrollment; add their UDID in the Apple Developer portal, rebuild, and upload the new IPA here.
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Release history</h2>

          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && (!releases || releases.length === 0) && (
            <p className="text-sm text-gray-500">No iOS releases uploaded yet.</p>
          )}

          {releases && releases.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-2 pr-3">Build</th>
                    <th className="py-2 pr-3">Version</th>
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
                        {r.isCurrent && <Badge variant="green">Current</Badge>}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="ghost"
                            loading={download.isPending && download.variables?.id === r.id}
                            onClick={() => download.mutate(r)}>
                            Download
                          </Button>
                          {!r.isCurrent && (
                            <Button size="sm" variant="ghost"
                              onClick={() => patch.mutate({ id: r.id, isCurrent: true })}>
                              Set current
                            </Button>
                          )}
                          <Button size="sm" variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete release ${r.versionName} (build ${r.versionCode})?`)) {
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

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Enrolled devices</h2>

          {devicesLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!devicesLoading && (!devices || devices.length === 0) && (
            <p className="text-sm text-gray-500">
              No devices enrolled yet. Send users the enrollment link above.
            </p>
          )}

          {devices && devices.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="py-2 pr-3">UDID</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3">iOS</th>
                    <th className="py-2 pr-3">Enrolled</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1">
                          <code className="font-mono text-xs text-gray-600">{d.udid}</code>
                          <button
                            type="button"
                            className="p-1 text-gray-400 hover:text-v-violet"
                            onClick={() => { navigator.clipboard.writeText(d.udid); toast.success('UDID copied'); }}
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                        {d.name && <p className="text-xs text-gray-500 mt-0.5">{d.name}</p>}
                      </td>
                      <td className="py-3 pr-3 text-gray-500">{d.product ?? '—'}</td>
                      <td className="py-3 pr-3 text-gray-500">{d.osVersion ?? '—'}</td>
                      <td className="py-3 pr-3 text-gray-500">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-3">
                        {d.registered
                          ? <Badge variant="green">Registered</Badge>
                          : <Badge variant="yellow">Awaiting Apple registration</Badge>}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="ghost"
                            onClick={() => patchDevice.mutate({ id: d.id, registered: !d.registered })}>
                            {d.registered ? 'Mark unregistered' : 'Mark registered'}
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => {
                              const name = prompt('Device label', d.name ?? '');
                              if (name !== null) patchDevice.mutate({ id: d.id, name });
                            }}>
                            Rename
                          </Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete device ${d.name ?? d.udid}?`)) delDevice.mutate(d.id);
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

      <Card>
        <div className="p-6">
          <button
            type="button"
            onClick={() => setUploadOpen((o) => !o)}
            className="flex items-center gap-2 w-full text-left"
          >
            {uploadOpen ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            <h2 className="text-lg font-semibold text-v-charcoal">Upload new release</h2>
          </button>

          {uploadOpen && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">IPA file (Ad Hoc signed)</label>
                <input
                  type="file"
                  accept=".ipa"
                  onChange={(e) => setIpa(e.target.files?.[0] ?? null)}
                  className="block mt-1 w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-v-violet file:text-white hover:file:bg-v-violet/90"
                />
                {ipa && (
                  <p className="mt-1 text-xs text-gray-500">
                    {ipa.name} — {formatBytes(ipa.size)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Build number (integer, must be > previous)"
                  type="number" min={1}
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value)}
                  placeholder="2"
                />
                <Input
                  label="Version (display string)"
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
                  Set as current (install page serves this build immediately)
                </label>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleUpload}
                  loading={upload.isPending}
                  disabled={!ipa || !versionCode || !versionName.trim()}
                >
                  Upload release
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
