import { Barcode, CheckCircle2, Copy, Plus, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useActivateGs1Prefix,
  useCreateGs1Prefix,
  useGs1Prefixes,
  useIdentification,
  usePrefixPreview,
  useSupersedeGs1Prefix,
  useUpdateIdentification,
  useWithdrawGs1Prefix,
  type Gs1Prefix,
} from '@/hooks/useIdentification';

const inputCls =
  'w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink';

function prefixBadge(status: Gs1Prefix['status']) {
  switch (status) {
    case 'ACTIVE': return <Badge variant="green">Active</Badge>;
    case 'PENDING': return <Badge variant="yellow">Pending</Badge>;
    case 'SUPERSEDED': return <Badge variant="gray">Superseded</Badge>;
    case 'WITHDRAWN': return <Badge variant="red">Withdrawn</Badge>;
  }
}

function CopyValue({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs text-v-charcoal truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
      <button
        type="button"
        className="text-gray-400 hover:text-v-pink shrink-0"
        title="Copy"
        onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied'); }}
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

export function IdentificationPage() {
  const { data: ident, isLoading } = useIdentification();
  const { data: prefixes = [] } = useGs1Prefixes();
  const updateIdent = useUpdateIdentification();
  const createPrefix = useCreateGs1Prefix();
  const activatePrefix = useActivateGs1Prefix();
  const supersedePrefix = useSupersedeGs1Prefix();
  const withdrawPrefix = useWithdrawGs1Prefix();

  // Settings form
  const [slug, setSlug] = useState<string | null>(null);
  const [tenantMark, setTenantMark] = useState<string | null>(null);
  const [settlingDays, setSettlingDays] = useState<string | null>(null);

  // New prefix form
  const [showPrefixForm, setShowPrefixForm] = useState(false);
  const [newPrefix, setNewPrefix] = useState('');
  const [memberOrg, setMemberOrg] = useState('');
  const [licensedOn, setLicensedOn] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const { data: preview } = usePrefixPreview(newPrefix);

  // Activate / supersede dialogs
  const [activating, setActivating] = useState<Gs1Prefix | null>(null);
  const [confirmCount, setConfirmCount] = useState('');
  const [superseding, setSuperseding] = useState<Gs1Prefix | null>(null);
  const [supersedeReason, setSupersedeReason] = useState('');

  if (isLoading || !ident) {
    return <div className="text-sm text-gray-500 p-8">Loading identification settings…</div>;
  }

  const hasActive = prefixes.some((p) => p.status === 'ACTIVE');

  const saveSettings = () => {
    updateIdent.mutate({
      ...(slug !== null && slug !== ident.slug ? { slug } : {}),
      ...(tenantMark !== null ? { tenantMark: tenantMark || null } : {}),
      ...(settlingDays !== null ? { settlingPeriodDays: Number(settlingDays) } : {}),
    } as Partial<typeof ident>);
  };

  const submitPrefix = () => {
    if (!/^\d{6,12}$/.test(newPrefix) || !memberOrg) return;
    createPrefix.mutate(
      {
        prefix: newPrefix,
        gs1MemberOrg: memberOrg,
        licensedOn: licensedOn || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setShowPrefixForm(false);
          setNewPrefix(''); setMemberOrg(''); setLicensedOn(''); setCapacity(''); setNotes('');
        },
      },
    );
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Identification &amp; GS1</h1>
          <p className="text-sm text-gray-500 mt-1">
            Asset identifier scheme, GS1 Company Prefix and RFID encoding policy
          </p>
        </div>
        <Badge variant={ident.mode === 'GS1' ? 'green' : 'default'}>
          {ident.mode === 'GS1' ? 'GS1 mode' : 'Internal mode'}
        </Badge>
      </div>

      {/* ── Identification settings ── */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-v-charcoal">Identification settings</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Every asset carries a 12-digit Individual Asset Reference (IAR) allocated by the
            server. These settings shape labels and Digital Links.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Tenant slug</label>
              <input
                value={slug ?? ident.slug}
                onChange={(e) => setSlug(e.target.value)}
                className={inputCls}
                placeholder="acme-fm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Used in internal Digital Links: <span className="font-mono">/t/{slug ?? ident.slug}/asset/…</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Tenant mark</label>
              <input
                value={tenantMark ?? ident.tenantMark ?? ''}
                onChange={(e) => setTenantMark(e.target.value.toUpperCase().slice(0, 12))}
                className={inputCls}
                placeholder="ACME"
              />
              <p className="text-xs text-gray-400 mt-1">Short code printed before the HRI. Cosmetic only.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Settling period (days)</label>
              <input
                type="number"
                min={0}
                value={settlingDays ?? String(ident.settlingPeriodDays)}
                onChange={(e) => setSettlingDays(e.target.value)}
                className={inputCls}
              />
              <p className="text-xs text-gray-400 mt-1">Tags cannot be permalocked before this elapses.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-v-charcoal">
              <input
                type="checkbox"
                checked={ident.allowInternalPermalock}
                onChange={(e) => updateIdent.mutate({ allowInternalPermalock: e.target.checked })}
                className="rounded border-gray-300 text-v-pink focus:ring-v-pink"
              />
              Allow permalock in internal mode
              <span title="Permalock is irreversible. Leave off unless tags will never be migrated to GS1.">
                <ShieldAlert size={14} className="text-amber-500" />
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-v-charcoal">
              <input
                type="checkbox"
                checked={ident.allowGiai202}
                onChange={(e) => updateIdent.mutate({ allowGiai202: e.target.checked })}
                className="rounded border-gray-300 text-v-pink focus:ring-v-pink"
              />
              Allow GIAI-202 encoding (exception path)
            </label>
          </div>
          <div>
            <Button size="sm" onClick={saveSettings} loading={updateIdent.isPending}
              disabled={slug === null && tenantMark === null && settlingDays === null}>
              Save settings
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── GS1 Company Prefixes ── */}
      <Card>
        <CardHeader className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-v-charcoal">GS1 Company Prefix</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasActive
                ? 'This tenancy is in GS1 mode. Asset GIAIs are derived from the active prefix.'
                : 'Vairiot holds no GS1 prefix of its own. Enter the prefix your organisation has licensed from a GS1 member organisation, preview the result, then activate.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowPrefixForm(!showPrefixForm)}>
            <Plus size={14} className="mr-1" /> Register prefix
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {showPrefixForm && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-v-charcoal mb-1">Company prefix *</label>
                  <input
                    value={newPrefix}
                    onChange={(e) => setNewPrefix(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    className={`${inputCls} font-mono`}
                    placeholder="9521141"
                  />
                  <p className="text-xs text-gray-400 mt-1">6–12 digits, as licensed by your GS1 member organisation.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-charcoal mb-1">GS1 member organisation *</label>
                  <input value={memberOrg} onChange={(e) => setMemberOrg(e.target.value)}
                    className={inputCls} placeholder="GS1 UAE" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-charcoal mb-1">Licensed on</label>
                  <input type="date" value={licensedOn} onChange={(e) => setLicensedOn(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-charcoal mb-1">Capacity</label>
                  <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)}
                    className={inputCls} placeholder="100000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
              </div>

              {preview && (
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                  <p className="text-xs font-medium text-v-charcoal mb-1 flex items-center gap-1">
                    <Barcode size={12} /> Preview (sample reference {preview.sampleIar})
                  </p>
                  <CopyValue label="GIAI" value={preview.sampleGiai} />
                  <CopyValue label="EPC (GIAI-96)" value={preview.sampleEpcHex} />
                  <CopyValue label="Digital Link" value={preview.sampleDigitalLink} />
                  <p className="text-xs text-gray-400 mt-1">
                    Partition {preview.partition} · GIAI length {preview.giaiLength} of 30
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={submitPrefix} loading={createPrefix.isPending}
                  disabled={!/^\d{6,12}$/.test(newPrefix) || !memberOrg}>
                  Register
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowPrefixForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {prefixes.length === 0 && !showPrefixForm && (
            <p className="text-sm text-gray-500">
              No prefixes registered. Internal mode is fully supported indefinitely — labels use
              tenant-scoped Digital Links and RFID tags use their own serialised TID as EPC.
            </p>
          )}

          {prefixes.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4">Prefix</th>
                  <th className="py-2 pr-4">Member org</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Activated</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {prefixes.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-mono">{p.prefix}</td>
                    <td className="py-2 pr-4">{p.gs1MemberOrg}</td>
                    <td className="py-2 pr-4">{prefixBadge(p.status)}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">
                      {p.activatedAt ? new Date(p.activatedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 text-right space-x-2">
                      {p.status === 'PENDING' && !hasActive && (
                        <Button size="sm" onClick={() => { setActivating(p); setConfirmCount(''); }}>
                          <CheckCircle2 size={14} className="mr-1" /> Activate
                        </Button>
                      )}
                      {p.status === 'PENDING' && hasActive && (
                        <Button size="sm" variant="secondary"
                          onClick={() => { setSuperseding(p); setSupersedeReason(''); }}>
                          Supersede active
                        </Button>
                      )}
                      {p.status === 'PENDING' && (
                        <Button size="sm" variant="ghost" onClick={() => withdrawPrefix.mutate(p.id)}>
                          Withdraw
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* ── Activate dialog ── */}
      <ConfirmDialog
        open={!!activating}
        title={`Activate prefix ${activating?.prefix ?? ''}`}
        description="Activation switches this tenancy to GS1 mode."
        variant="primary"
        confirmLabel="Activate"
        loading={activatePrefix.isPending}
        onCancel={() => setActivating(null)}
        onConfirm={() => {
          if (!activating) return;
          activatePrefix.mutate(
            { id: activating.id, confirmAssetCount: confirmCount === '' ? undefined : Number(confirmCount) },
            { onSuccess: () => setActivating(null) },
          );
        }}
      >
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            A GIAI is derived for every identified asset. Existing labels keep working — internal
            Digital Links redirect to the GS1 form. This may take a while on a large register.
          </p>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">
              Confirm identified asset count (optional guard)
            </label>
            <input type="number" min={0} value={confirmCount}
              onChange={(e) => setConfirmCount(e.target.value)} className={inputCls}
              placeholder="Leave blank to skip the count check" />
          </div>
        </div>
      </ConfirmDialog>

      {/* ── Supersede dialog ── */}
      <ConfirmDialog
        open={!!superseding}
        title={`Supersede active prefix with ${superseding?.prefix ?? ''}`}
        description="The current prefix is retired in favour of this one."
        variant="primary"
        confirmLabel="Supersede"
        loading={supersedePrefix.isPending}
        onCancel={() => setSuperseding(null)}
        onConfirm={() => {
          if (!superseding || !supersedeReason.trim()) return;
          supersedePrefix.mutate(
            { id: superseding.id, reason: supersedeReason.trim() },
            { onSuccess: () => setSuperseding(null) },
          );
        }}
      >
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            The current prefix becomes <strong>superseded</strong>; every asset's old GIAI is
            preserved as a historic identifier and a new GIAI is derived from this prefix.
          </p>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Reason *</label>
            <input value={supersedeReason} onChange={(e) => setSupersedeReason(e.target.value)}
              className={inputCls} placeholder="e.g. capacity upgrade" />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
