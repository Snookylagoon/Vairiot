import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { AssetForm, AssetFormData } from '@/components/forms/AssetForm';
import { useCreateAsset } from '@/hooks/useAssets';
import { accountingPayload } from '@/lib/accounting';
import { geoPayload } from '@/lib/geo';
import { hasFeature, useAuthStore } from '@/stores/auth.store';

export function NewAssetPage() {
  const navigate    = useNavigate();
  const createAsset = useCreateAsset();
  const ipsas = useAuthStore(s => hasFeature(s.user, 'ipsas'));

  const toNum = (v?: string) => v ? Number(v) : undefined;

  const onSubmit = async (data: AssetFormData) => {
    await createAsset.mutateAsync({
      ...data,
      purchaseCost: toNum(data.purchaseCost),
      freightCost: toNum(data.freightCost),
      installationCost: toNum(data.installationCost),
      customsDuties: toNum(data.customsDuties),
      otherCapitalizedCosts: toNum(data.otherCapitalizedCosts),
      residualValue: toNum(data.residualValue),
      usefulLifeMonths: data.usefulLifeMonths ? Number(data.usefulLifeMonths) : undefined,
      ...geoPayload(data),
      ...accountingPayload(data, ipsas),
    });
    navigate('/assets');
  };

  return (
    <div className="max-w-3xl space-y-5">
      <button onClick={() => navigate('/assets')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Assets
      </button>
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">New Asset</h1>
        <p className="text-sm text-gray-500 mt-1">Fill in the details below to register a new asset.</p>
      </div>
      <AssetForm onSubmit={onSubmit} isLoading={createAsset.isPending} />
    </div>
  );
}
