import type { FieldErrors, UseFormRegister, UseFormWatch } from 'react-hook-form';
import { AcquisitionType } from 'vairiot-shared';

import { Input } from '@/components/ui/Input';
import { useAssetClasses } from '@/hooks/useAccounting';
import { ACQUISITION_LABELS, isFairValueAcquisition } from '@/lib/accounting';
import type { AssetFormData } from '@/lib/schemas';

const SELECT = 'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-v-pink bg-white';

interface AccountingFieldsProps {
  register: UseFormRegister<AssetFormData>;
  watch: UseFormWatch<AssetFormData>;
  errors: FieldErrors<AssetFormData>;
  /** The selected category's class, used when no class is chosen. */
  categoryClassName?: string | null;
}

/**
 * IPSAS fields of the asset form (stage 2.3), shown with the IPSAS ledger on.
 * The class sets the life, method and residual the asset starts with, and its
 * threshold decides whether the asset is recognised or expensed. Donations and
 * transfers are recognised at fair value.
 */
export function AccountingFields({ register, watch, errors, categoryClassName }: AccountingFieldsProps) {
  const { data: classes = [] } = useAssetClasses();
  const acquisitionType = watch('acquisitionType');

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Accounting (IPSAS)</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="assetClassId" className="block text-sm font-medium text-v-charcoal mb-1">Asset class</label>
          <select id="assetClassId" className={SELECT} {...register('assetClassId')}>
            <option value="">{categoryClassName ? `From category: ${categoryClassName}` : 'Choose a class'}</option>
            {classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
          {errors.assetClassId && <p className="text-xs text-red-600 mt-1">{errors.assetClassId.message}</p>}
        </div>
        <div>
          <label htmlFor="acquisitionType" className="block text-sm font-medium text-v-charcoal mb-1">Acquired by</label>
          <select id="acquisitionType" className={SELECT} {...register('acquisitionType')}>
            {Object.values(AcquisitionType).map(t => <option key={t} value={t}>{ACQUISITION_LABELS[t]}</option>)}
          </select>
        </div>
        {isFairValueAcquisition(acquisitionType) && <>
          <Input label="Fair value at recognition" type="number" step="0.01" min="0" placeholder="0.00"
            error={errors.fairValueAtRecognition?.message} {...register('fairValueAtRecognition')} />
          <Input label="Donor or transferring entity" placeholder="e.g. Tbilisi City Hall" {...register('sourceEntity')} />
        </>}
        <Input label="Recognition date" type="date" {...register('recognitionDate')} />
      </div>
      <p className="text-xs text-gray-400">
        {isFairValueAcquisition(acquisitionType)
          ? 'Recognised at fair value. Purchase costs are not used.'
          : 'Capitalised cost is the purchase cost plus the cost components below. Below the class’s threshold the asset is expensed.'}
      </p>
    </div>
  );
}
