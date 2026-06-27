import { useNavigate, useParams } from 'react-router-dom';
import { AssetForm, AssetFormData } from '@/components/forms/AssetForm';
import { useAsset, useUpdateAsset } from '@/hooks/useAssets';
import { ArrowLeft } from 'lucide-react';

function fmtDate(d?: string | null) {
  return d ? d.slice(0, 10) : '';
}

function toNum(v?: string) {
  return v ? Number(v) : undefined;
}

export function EditAssetPage() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { data: asset, isLoading } = useAsset(id!);
  const updateAsset = useUpdateAsset(id!);

  const onSubmit = async (data: AssetFormData) => {
    await updateAsset.mutateAsync({
      ...data,
      purchaseCost: toNum(data.purchaseCost),
      freightCost: toNum(data.freightCost),
      installationCost: toNum(data.installationCost),
      customsDuties: toNum(data.customsDuties),
      otherCapitalizedCosts: toNum(data.otherCapitalizedCosts),
      residualValue: toNum(data.residualValue),
      usefulLifeMonths: data.usefulLifeMonths ? Number(data.usefulLifeMonths) : undefined,
    });
    navigate(`/assets/${id}`);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (!asset)    return <div className="p-8 text-center text-gray-400">Asset not found.</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate(`/assets/${id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Asset
      </button>
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Edit Asset</h1>
        <p className="font-mono text-sm text-v-violet mt-0.5">{asset.assetNumber}</p>
      </div>
      <AssetForm
        defaultValues={{
          name:          asset.name,
          description:   asset.description ?? '',
          categoryId:    asset.category?.id ?? '',
          siteId:        asset.site?.id ?? '',
          locationId:    asset.location?.id ?? '',
          condition:     asset.condition ?? 'good',
          serialNumber:  asset.serialNumber ?? '',
          modelNumber:   asset.modelNumber ?? '',
          manufacturer:  asset.manufacturer ?? '',
          barcode:       asset.barcode ?? '',
          rfidTag:       asset.rfidTag ?? '',
          purchaseCost:  asset.purchaseCost ?? '',
          supplier:      asset.supplier ?? '',
          purchaseDate:  fmtDate(asset.purchaseDate),
          warrantyExpiry: fmtDate(asset.warrantyExpiry),
          purchaseOrderNumber: asset.purchaseOrderNumber ?? '',
          invoiceNumber: asset.invoiceNumber ?? '',
          invoiceDate:   fmtDate(asset.invoiceDate),
          receiptDate:   fmtDate(asset.receiptDate),
          capitalizationDate: fmtDate(asset.capitalizationDate),
          freightCost:   asset.freightCost ?? '',
          installationCost: asset.installationCost ?? '',
          customsDuties: asset.customsDuties ?? '',
          otherCapitalizedCosts: asset.otherCapitalizedCosts ?? '',
          residualValue: asset.residualValue ?? '',
          depreciationMethod: asset.depreciationMethod ?? 'straight_line',
          usefulLifeMonths: asset.usefulLifeMonths?.toString() ?? '',
          depreciationStartDate: fmtDate(asset.depreciationStartDate),
          notes:         asset.notes ?? '',
        }}
        onSubmit={onSubmit}
        isLoading={updateAsset.isPending}
        submitLabel="Update Asset"
      />
    </div>
  );
}
