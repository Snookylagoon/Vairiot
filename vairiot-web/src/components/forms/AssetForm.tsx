import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useCategories, useCreateCategory } from '@/hooks/useCategories';
import { useLocations, useCreateLocation } from '@/hooks/useLocations';
import { useSites, useCreateSite } from '@/hooks/useSites';
import { assetSchema, type AssetFormData } from '@/lib/schemas';

export type { AssetFormData } from '@/lib/schemas';

interface AssetFormProps {
  defaultValues?: Partial<AssetFormData>;
  onSubmit:       (data: AssetFormData) => Promise<void>;
  submitLabel?:   string;
  isLoading?:     boolean;
}

function InlineCreateDialog({ title, label, onSave, onCancel }: {
  title: string; label: string;
  onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-lg font-semibold text-v-charcoal">{title}</h3>
        <Input label={label} value={name} onChange={e => setName(e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}`} autoFocus />
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Create</Button>
        </div>
      </div>
    </div>
  );
}

export function AssetForm({ defaultValues, onSubmit, submitLabel = 'Save Asset', isLoading }: AssetFormProps) {
  const { data: categories = [] } = useCategories();
  const { data: sites      = [] } = useSites();
  const createCategory = useCreateCategory();
  const createSite     = useCreateSite();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues,
  });

  const selectedSiteId = watch('siteId');
  const { data: locations = [] } = useLocations(selectedSiteId);
  const createLocation = useCreateLocation(selectedSiteId);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddSite, setShowAddSite]         = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add__') {
      e.target.value = defaultValues?.categoryId ?? '';
      setShowAddCategory(true);
    }
  };

  const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add__') {
      e.target.value = defaultValues?.siteId ?? '';
      setShowAddSite(true);
    } else {
      setValue('locationId', '');
    }
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add__') {
      e.target.value = defaultValues?.locationId ?? '';
      setShowAddLocation(true);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Core details */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Asset Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Asset Name *" placeholder="e.g. Dell Laptop XPS 15"
                error={errors.name?.message}
                {...register('name')} />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Description" rows={2} placeholder="Optional description"
                {...register('description')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Category</label>
              <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                {...register('categoryId', { onChange: handleCategoryChange })}>
                <option value="">— Select category —</option>
                {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__add__">+ Add Category</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Site</label>
              <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                {...register('siteId', { onChange: handleSiteChange })}>
                <option value="">— Select site —</option>
                {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__add__">+ Add Site</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Location</label>
              <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                disabled={!selectedSiteId}
                {...register('locationId', { onChange: handleLocationChange })}>
                <option value="">{selectedSiteId ? '— Select location —' : '— Select a site first —'}</option>
                {locations.map((l: { id: string; name: string }) => <option key={l.id} value={l.id}>{l.name}</option>)}
                {selectedSiteId && <option value="__add__">+ Add Location</option>}
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

        {/* Financial & Procurement */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Financial & Procurement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Purchase Cost"  type="number" step="0.01" placeholder="0.00"      {...register('purchaseCost')} />
            <Input label="Supplier"           placeholder="Supplier name"                        {...register('supplier')} />
            <Input label="Purchase Date"      type="date"                                        {...register('purchaseDate')} />
            <Input label="Warranty Expiry"    type="date"                                        {...register('warrantyExpiry')} />
            <Input label="PO Number"          placeholder="PO-XXXXX"                             {...register('purchaseOrderNumber')} />
            <Input label="Invoice Number"     placeholder="INV-XXXXX"                            {...register('invoiceNumber')} />
            <Input label="Invoice Date"       type="date"                                        {...register('invoiceDate')} />
            <Input label="Receipt Date"       type="date"                                        {...register('receiptDate')} />
            <Input label="Capitalization Date" type="date"                                       {...register('capitalizationDate')} />
          </div>
        </div>

        {/* Cost Components */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Cost Components</h3>
          <p className="text-xs text-gray-400">Additional costs capitalized into the asset value</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Freight Cost"       type="number" step="0.01" placeholder="0.00" {...register('freightCost')} />
            <Input label="Installation Cost"  type="number" step="0.01" placeholder="0.00" {...register('installationCost')} />
            <Input label="Customs Duties"     type="number" step="0.01" placeholder="0.00" {...register('customsDuties')} />
            <Input label="Other Capitalized Costs" type="number" step="0.01" placeholder="0.00" {...register('otherCapitalizedCosts')} />
          </div>
        </div>

        {/* Depreciation */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Depreciation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Method</label>
              <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                {...register('depreciationMethod')}>
                <option value="straight_line">Straight Line</option>
                <option value="none">None</option>
              </select>
            </div>
            <Input label="Residual Value"     type="number" step="0.01" placeholder="0.00"  {...register('residualValue')} />
            <Input label="Useful Life (Months)" type="number" step="1" placeholder="e.g. 60" {...register('usefulLifeMonths')} />
            <Input label="Depreciation Start Date" type="date"                               {...register('depreciationStartDate')} />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-v-charcoal text-sm uppercase tracking-wider">Notes</h3>
          <Textarea rows={3} placeholder="Any additional notes about this asset"
            {...register('notes')} />
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={isLoading} size="lg">{submitLabel}</Button>
          <Button type="button" variant="secondary" size="lg" onClick={() => window.history.back()}>Cancel</Button>
        </div>
      </form>

      {showAddCategory && (
        <InlineCreateDialog title="Add Category" label="Category Name"
          onCancel={() => setShowAddCategory(false)}
          onSave={name => {
            createCategory.mutate({ name }, {
              onSuccess: (created: { id: string }) => {
                setValue('categoryId', created.id);
                setShowAddCategory(false);
              },
            });
          }} />
      )}

      {showAddSite && (
        <InlineCreateDialog title="Add Site" label="Site Name"
          onCancel={() => setShowAddSite(false)}
          onSave={name => {
            createSite.mutate({ name }, {
              onSuccess: (created: { id: string }) => {
                setValue('siteId', created.id);
                setShowAddSite(false);
              },
            });
          }} />
      )}

      {showAddLocation && (
        <InlineCreateDialog title="Add Location" label="Location Name"
          onCancel={() => setShowAddLocation(false)}
          onSave={name => {
            createLocation.mutate({ name }, {
              onSuccess: (created: { id: string }) => {
                setValue('locationId', created.id);
                setShowAddLocation(false);
              },
            });
          }} />
      )}
    </>
  );
}
