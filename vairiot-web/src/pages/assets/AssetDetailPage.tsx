import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Tag, MapPin, Calendar, DollarSign, TrendingDown, Trash2, Archive, FileText } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { AssetPhotos } from '@/components/assets/AssetPhotos';
import { AssetDocuments } from '@/components/assets/AssetDocuments';
import { AssetTimeline } from '@/components/assets/AssetTimeline';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsset, useDeleteAsset, useDisposeAsset } from '@/hooks/useAssets';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';
import { useCurrency } from '@/hooks/useCurrency';
import { disposalSchema, type DisposalFormData } from '@/lib/schemas';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm text-v-charcoal">{value ?? '—'}</p>
    </div>
  );
}

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString('en-GB') : undefined;
}

function DisposalDialog({ open, assetId, onClose, currencySymbol }: { open: boolean; assetId: string; onClose: () => void; currencySymbol: string }) {
  const navigate = useNavigate();
  const disposeAsset = useDisposeAsset(assetId);
  const { register, handleSubmit, formState: { errors } } = useForm<DisposalFormData>({
    resolver: zodResolver(disposalSchema),
  });

  const onSubmit = async (data: DisposalFormData) => {
    await disposeAsset.mutateAsync({
      ...data,
      disposalValue: data.disposalValue ? Number(data.disposalValue) : undefined,
    });
    onClose();
    navigate(`/assets/${assetId}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-lg font-bold text-v-charcoal">Dispose Asset</h2>
        <p className="text-sm text-gray-500">Record the formal disposal of this asset. This will set its status to disposed and create an audit record.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Disposal Date *" type="date" error={errors.disposalDate?.message} {...register('disposalDate')} />
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Method *</label>
              <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                {...register('disposalMethod')}>
                <option value="">— Select —</option>
                <option value="sale">Sale</option>
                <option value="scrap">Scrap</option>
                <option value="donation">Donation</option>
                <option value="write_off">Write-Off</option>
                <option value="trade_in">Trade-In</option>
              </select>
              {errors.disposalMethod && <p className="text-xs text-red-500 mt-1">{errors.disposalMethod.message}</p>}
            </div>
            <Input label={`Disposal Value (${currencySymbol})`} type="number" step="0.01" placeholder="0.00" {...register('disposalValue')} />
            <Input label="Approved By" placeholder="Name or employee ID" {...register('approvedBy')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Reason</label>
            <textarea rows={2} placeholder="Reason for disposal"
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none"
              {...register('disposalReason')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Notes</label>
            <textarea rows={2} placeholder="Additional notes"
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none"
              {...register('notes')} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="danger" loading={disposeAsset.isPending}>Confirm Disposal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { fmt, symbol: currencySymbol } = useCurrency();
  const canWrite  = hasAnyPermission(user, 'asset:write');
  const canDelete = hasAnyPermission(user, 'asset:delete');
  const deleteAsset = useDeleteAsset();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDisposal, setShowDisposal] = useState(false);

  const { data: asset, isLoading } = useAsset(id!);

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (!asset)    return <div className="p-8 text-center text-gray-400">Asset not found.</div>;

  const dep = asset.depreciation;
  const isDisposed = asset.status === 'disposed';
  const isArchived = Boolean(asset.deletedAt);

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={() => navigate('/assets')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Assets
      </button>

      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-sm text-v-violet">{asset.assetNumber}</p>
          <h1 className="text-2xl font-bold text-v-charcoal mt-0.5">{asset.name}</h1>
          {asset.description && <p className="text-sm text-gray-500 mt-1">{asset.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge label={asset.status} variant={asset.status as 'active'|'inactive'} />
          <Badge label={asset.condition} variant="default" />
          {isArchived && <Badge label="Archived" variant="inactive" />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identification */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Tag size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Identification</span>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Serial Number"  value={asset.serialNumber} />
              <Field label="Model Number"   value={asset.modelNumber} />
              <Field label="Manufacturer"   value={asset.manufacturer} />
              <Field label="Barcode"        value={asset.barcode} />
              <Field label="RFID Tag"       value={asset.rfidTag} />
            </div>
            {asset.labelImage && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Printed Label</p>
                <img
                  src={asset.labelImage}
                  alt="Asset label"
                  className="border border-gray-200 rounded"
                  style={{ maxWidth: 220, height: 'auto' }}
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <MapPin size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Location</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Category" value={asset.category?.name} />
            <Field label="Site"     value={asset.site?.name} />
            <Field label="Location" value={asset.location?.name} />
          </CardBody>
        </Card>

        {/* Financial: Procurement */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <DollarSign size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Procurement</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Purchase Cost"    value={fmt(asset.purchaseCost)} />
            <Field label="Supplier"         value={asset.supplier} />
            <Field label="Purchase Date"    value={fmtDate(asset.purchaseDate)} />
            <Field label="PO Number"        value={asset.purchaseOrderNumber} />
            <Field label="Invoice Number"   value={asset.invoiceNumber} />
            <Field label="Invoice Date"     value={fmtDate(asset.invoiceDate)} />
            <Field label="Receipt Date"     value={fmtDate(asset.receiptDate)} />
            <Field label="Capitalization Date" value={fmtDate(asset.capitalizationDate)} />
            <Field label="Warranty Expiry"  value={fmtDate(asset.warrantyExpiry)} />
          </CardBody>
        </Card>

        {/* Financial: Cost Components & Valuation */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <FileText size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Cost Components</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Purchase Cost"       value={fmt(asset.purchaseCost)} />
            <Field label="Freight"             value={fmt(asset.freightCost)} />
            <Field label="Installation"        value={fmt(asset.installationCost)} />
            <Field label="Customs Duties"      value={fmt(asset.customsDuties)} />
            <Field label="Other Capitalized"   value={fmt(asset.otherCapitalizedCosts)} />
            <Field label="Capitalized Cost"    value={fmt(dep?.capitalizedCost)} />
            <Field label="Residual Value"      value={fmt(asset.residualValue)} />
          </CardBody>
        </Card>

        {/* Depreciation */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <TrendingDown size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Depreciation</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Method" value={asset.depreciationMethod === 'straight_line' ? 'Straight Line' : asset.depreciationMethod ?? 'Not set'} />
            <Field label="Useful Life" value={asset.usefulLifeMonths ? `${asset.usefulLifeMonths} months` : undefined} />
            <Field label="Start Date"  value={fmtDate(asset.depreciationStartDate)} />
            <Field label="Monthly Depreciation" value={fmt(dep?.monthlyDepreciation)} />
            <Field label="Accumulated Depreciation" value={fmt(dep?.accumulatedDepreciation)} />
            <Field label="Net Book Value" value={fmt(dep?.netBookValue)} />
          </CardBody>
        </Card>

        {/* Record */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Calendar size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Record</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Created"  value={fmtDate(asset.createdAt)} />
            <Field label="Updated"  value={fmtDate(asset.updatedAt)} />
          </CardBody>
        </Card>
      </div>

      {/* Disposal Record (if disposed) */}
      {asset.disposal && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Trash2 size={16} className="text-red-500" />
            <span className="font-semibold text-red-600 text-sm">Disposal Record</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Disposal Date"   value={fmtDate(asset.disposal.disposalDate)} />
            <Field label="Method"          value={asset.disposal.disposalMethod} />
            <Field label="Disposal Value"  value={fmt(asset.disposal.disposalValue)} />
            <Field label="NBV at Disposal" value={fmt(asset.disposal.netBookValueAtDisposal)} />
            <Field label="Gain / Loss"     value={fmt(asset.disposal.gainLoss)} />
            <Field label="Approved By"     value={asset.disposal.approvedBy} />
            <Field label="Reason"          value={asset.disposal.disposalReason} />
            {asset.disposal.notes && <div className="col-span-2"><Field label="Notes" value={asset.disposal.notes} /></div>}
          </CardBody>
        </Card>
      )}

      <AssetPhotos assetId={asset.id} />

      <AssetDocuments assetId={asset.id} />

      <AssetTimeline assetId={asset.id} />

      {/* Actions */}
      <div className="flex gap-3">
        {canWrite && !isDisposed && !isArchived && (
          <Button variant="secondary" onClick={() => navigate(`/assets/${id}/edit`)}>Edit Asset</Button>
        )}
        {canWrite && !isDisposed && !isArchived && (
          <Button variant="danger" onClick={() => setShowDisposal(true)}>
            <Trash2 size={14} className="mr-1" /> Dispose Asset
          </Button>
        )}
        {canDelete && !isArchived && (
          <Button variant="secondary" onClick={() => setShowArchiveConfirm(true)}>
            <Archive size={14} className="mr-1" /> Archive
          </Button>
        )}
      </div>

      {/* Archive confirmation */}
      <ConfirmDialog
        open={showArchiveConfirm}
        title="Archive Asset"
        description={`Archive "${asset.name}" (${asset.assetNumber})? It will be hidden from the default asset list but retained for audit purposes.`}
        confirmLabel="Archive"
        loading={deleteAsset.isPending}
        onConfirm={() => {
          deleteAsset.mutate(asset.id, {
            onSuccess: () => navigate('/assets'),
          });
        }}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      {/* Disposal dialog */}
      <DisposalDialog open={showDisposal} assetId={asset.id} onClose={() => setShowDisposal(false)} currencySymbol={currencySymbol} />
    </div>
  );
}
