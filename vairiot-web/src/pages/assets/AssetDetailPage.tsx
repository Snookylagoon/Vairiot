import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Tag, MapPin, Calendar, DollarSign, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AssetPhotos } from '@/components/assets/AssetPhotos';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDeleteAsset } from '@/hooks/useAssets';
import { hasPermission, useAuthStore } from '@/stores/auth.store';
import type { Asset } from '@/types';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm text-v-charcoal">{value ?? '—'}</p>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canWrite  = hasPermission(user, 'asset:write');
  const canDelete = hasPermission(user, 'asset:delete');
  const deleteAsset = useDeleteAsset();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ['asset', id],
    queryFn:  () => api.get(`/api/v1/assets/${id}`).then(r => r.data),
    enabled:  Boolean(id),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (!asset)    return <div className="p-8 text-center text-gray-400">Asset not found.</div>;

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
          <Badge label={asset.status}    variant={asset.status as 'active'|'inactive'} />
          <Badge label={asset.condition} variant="default" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Tag size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Identification</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Serial Number"  value={asset.serialNumber} />
            <Field label="Model Number"   value={(asset as unknown as { modelNumber?: string }).modelNumber} />
            <Field label="Manufacturer"   value={(asset as unknown as { manufacturer?: string }).manufacturer} />
            <Field label="Barcode"        value={asset.barcode} />
            <Field label="RFID Tag"       value={asset.rfidTag} />
          </CardBody>
        </Card>

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

        <Card>
          <CardHeader className="flex items-center gap-2">
            <DollarSign size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Financial</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Purchase Cost"    value={asset.purchaseCost ? `$${asset.purchaseCost}` : undefined} />
            <Field label="Purchase Date"    value={asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString('en-GB') : undefined} />
            <Field label="Warranty Expiry"  value={asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString('en-GB') : undefined} />
            <Field label="Supplier"         value={(asset as unknown as { supplier?: string }).supplier} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <Calendar size={16} className="text-v-violet" />
            <span className="font-semibold text-v-charcoal text-sm">Record</span>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Created"  value={new Date(asset.createdAt).toLocaleDateString('en-GB')} />
            <Field label="Updated"  value={new Date(asset.updatedAt).toLocaleDateString('en-GB')} />
          </CardBody>
        </Card>
      </div>

      <AssetPhotos assetId={asset.id} />

      <div className="flex gap-3">
        {canWrite && <Button variant="secondary" onClick={() => navigate(`/assets/${id}/edit`)}>Edit Asset</Button>}
        {canDelete && (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={14} className="mr-1" /> Delete Asset
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Asset"
        description={`Permanently delete "${asset.name}" (${asset.assetNumber})? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteAsset.isPending}
        onConfirm={() => {
          deleteAsset.mutate(asset.id, {
            onSuccess: () => navigate('/assets'),
          });
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
