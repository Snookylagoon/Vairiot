import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useCategories } from '@/hooks/useCategories';
import { useSites } from '@/hooks/useSites';

export interface AssetFormData {
  name:          string;
  description?:  string;
  categoryId?:   string;
  siteId?:       string;
  serialNumber?: string;
  modelNumber?:  string;
  manufacturer?: string;
  barcode?:      string;
  rfidTag?:      string;
  purchaseCost?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  supplier?:     string;
  notes?:        string;
  condition?:    string;
}

interface AssetFormProps {
  defaultValues?: Partial<AssetFormData>;
  onSubmit:       (data: AssetFormData) => Promise<void>;
  submitLabel?:   string;
  isLoading?:     boolean;
}

export function AssetForm({ defaultValues, onSubmit, submitLabel = 'Save Asset', isLoading }: AssetFormProps) {
  const { data: categories = [] } = useCategories();
  const { data: sites      = [] } = useSites();

  const { register, handleSubmit, formState: { errors } } = useForm<AssetFormData>({ defaultValues });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Core details */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Asset Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input label="Asset Name *" placeholder="e.g. Dell Laptop XPS 15"
              error={errors.name?.message}
              {...register('name', { required: 'Asset name is required' })} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-v-charcoal mb-1">Description</label>
            <textarea rows={2} placeholder="Optional description"
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none"
              {...register('description')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Category</label>
            <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
              {...register('categoryId')}>
              <option value="">— Select category —</option>
              {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Site</label>
            <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
              {...register('siteId')}>
              <option value="">— Select site —</option>
              {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Condition</label>
            <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
              {...register('condition')}>
              <option value="good">Good</option>
              <option value="excellent">Excellent</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Identification */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Identification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Serial Number"  placeholder="SN-XXXXXXXX" {...register('serialNumber')} />
          <Input label="Model Number"   placeholder="Model"       {...register('modelNumber')} />
          <Input label="Manufacturer"   placeholder="Manufacturer"  {...register('manufacturer')} />
          <Input label="Barcode"        placeholder="Scan or type barcode"  {...register('barcode')} />
          <Input label="RFID Tag (EPC)" placeholder="Scan RFID tag"         {...register('rfidTag')}
            hint="Scan using a Meferi device to auto-populate" />
        </div>
      </div>

      {/* Financial */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Financial & Procurement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Purchase Cost (£)"  type="number" step="0.01" placeholder="0.00"      {...register('purchaseCost')} />
          <Input label="Supplier"           placeholder="Supplier name"                        {...register('supplier')} />
          <Input label="Purchase Date"      type="date"                                        {...register('purchaseDate')} />
          <Input label="Warranty Expiry"    type="date"                                        {...register('warrantyExpiry')} />
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Notes</h3>
        <textarea rows={3} placeholder="Any additional notes about this asset"
          className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none"
          {...register('notes')} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" loading={isLoading} size="lg">{submitLabel}</Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => window.history.back()}>Cancel</Button>
      </div>
    </form>
  );
}
