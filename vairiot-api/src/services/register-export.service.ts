import { toCsv } from '../lib/csv';
import { prisma } from '../lib/prisma';

import { listAssetsForExport, type AssetListParams } from './asset.service';

// The register as CSV (moved from the assets router at stage 2.14). G33: the
// condition grade, the position's accuracy and source, the asset class, and
// the finance and legacy references, with headers the staged import maps on
// its own, so an exported register can be imported back (update mode keys on
// the Finance Reference).

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function registerCsv(tenantId: string, params: Omit<AssetListParams, 'page' | 'pageSize' | 'sortBy' | 'sortOrder'>): Promise<string> {
  const rows = await listAssetsForExport(tenantId, params);
  const ids = await prisma.assetSecondaryIdentifier.findMany({
    where: { tenantId, assetId: { in: rows.map((a: any) => a.id) }, scheme: { in: ['FINANCE_REF', 'LEGACY_TAG'] }, validTo: null },
    select: { assetId: true, scheme: true, value: true },
    orderBy: { validFrom: 'asc' },
  });
  const refs = new Map<string, Partial<Record<'FINANCE_REF' | 'LEGACY_TAG', string>>>();
  for (const i of ids) refs.set(i.assetId, { ...refs.get(i.assetId), [i.scheme]: refs.get(i.assetId)?.[i.scheme as 'FINANCE_REF'] ?? i.value });
    const fmtDate = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '';
    const fmtDec = (d: any) => d ? d.toString() : '';
    const flat = rows.map((a: any) => ({
      assetNumber: a.assetNumber, name: a.name, status: a.status, condition: a.condition,
      category: a.category?.name ?? '', site: a.site?.name ?? '', location: a.location?.name ?? '', custodian: a.custodian ?? '',
      latitude: a.latitude?.toString() ?? '', longitude: a.longitude?.toString() ?? '',
      serialNumber: a.serialNumber ?? '', modelNumber: a.modelNumber ?? '', manufacturer: a.manufacturer ?? '',
      barcode: a.barcode ?? '', rfidTag: a.rfidTag ?? '',
      purchaseDate: fmtDate(a.purchaseDate), purchaseCost: fmtDec(a.purchaseCost),
      purchaseOrderNumber: a.purchaseOrderNumber ?? '', invoiceNumber: a.invoiceNumber ?? '',
      invoiceDate: fmtDate(a.invoiceDate), receiptDate: fmtDate(a.receiptDate),
      capitalizationDate: fmtDate(a.capitalizationDate),
      freightCost: fmtDec(a.freightCost), installationCost: fmtDec(a.installationCost),
      customsDuties: fmtDec(a.customsDuties), otherCapitalizedCosts: fmtDec(a.otherCapitalizedCosts),
      capitalizedCost: a.depreciation?.capitalizedCost?.toString() ?? '',
      residualValue: fmtDec(a.residualValue), usefulLifeMonths: a.usefulLifeMonths?.toString() ?? '',
      depreciationMethod: a.depreciationMethod ?? '',
      monthlyDepreciation: a.depreciation?.monthlyDepreciation?.toString() ?? '',
      accumulatedDepreciation: a.depreciation?.accumulatedDepreciation?.toString() ?? '',
      netBookValue: a.depreciation?.netBookValue?.toString() ?? '',
      warrantyExpiry: fmtDate(a.warrantyExpiry), supplier: a.supplier ?? '', notes: a.notes ?? '',
      conditionGrade: a.conditionGrade?.toString() ?? '', classCode: a.assetClass?.code ?? '',
      geoAccuracyMeters: a.geoAccuracyMeters?.toString() ?? '', geoSource: a.geoSource ?? '',
      financeRef: refs.get(a.id)?.FINANCE_REF ?? '', legacyAssetNumber: refs.get(a.id)?.LEGACY_TAG ?? '',
      createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    }));
    return toCsv(flat, [
      { key: 'assetNumber',    header: 'Asset Number' },
      { key: 'name',           header: 'Name' },
      { key: 'status',         header: 'Status' },
      { key: 'condition',      header: 'Condition' },
      { key: 'conditionGrade', header: 'Condition Grade' },
      { key: 'category',       header: 'Category' },
      { key: 'classCode',      header: 'Asset Class' },
      { key: 'site',           header: 'Site' },
      { key: 'location',       header: 'Location' },
      { key: 'custodian',      header: 'Custodian' },
      { key: 'latitude',       header: 'Latitude' },
      { key: 'longitude',      header: 'Longitude' },
      { key: 'geoAccuracyMeters', header: 'Position Accuracy (m)' },
      { key: 'geoSource',      header: 'Position Source' },
      { key: 'serialNumber',   header: 'Serial Number' },
      { key: 'modelNumber',    header: 'Model Number' },
      { key: 'manufacturer',   header: 'Manufacturer' },
      { key: 'barcode',        header: 'Manufacturer EAN' },
      { key: 'rfidTag',        header: 'RFID Tag' },
      { key: 'purchaseDate',   header: 'Purchase Date' },
      { key: 'purchaseCost',   header: 'Purchase Cost' },
      { key: 'purchaseOrderNumber', header: 'PO Number' },
      { key: 'invoiceNumber',  header: 'Invoice Number' },
      { key: 'invoiceDate',    header: 'Invoice Date' },
      { key: 'receiptDate',    header: 'Receipt Date' },
      { key: 'capitalizationDate', header: 'Capitalization Date' },
      { key: 'freightCost',    header: 'Freight Cost' },
      { key: 'installationCost', header: 'Installation Cost' },
      { key: 'customsDuties',  header: 'Customs Duties' },
      { key: 'otherCapitalizedCosts', header: 'Other Capitalized Costs' },
      { key: 'capitalizedCost', header: 'Capitalized Cost' },
      { key: 'residualValue',  header: 'Residual Value' },
      { key: 'depreciationMethod', header: 'Depreciation Method' },
      { key: 'usefulLifeMonths', header: 'Useful Life (Months)' },
      { key: 'monthlyDepreciation', header: 'Monthly Depreciation' },
      { key: 'accumulatedDepreciation', header: 'Accumulated Depreciation' },
      { key: 'netBookValue',   header: 'Net Book Value' },
      { key: 'warrantyExpiry', header: 'Warranty Expiry' },
      { key: 'supplier',       header: 'Supplier' },
      { key: 'notes',          header: 'Notes' },
      { key: 'financeRef',     header: 'Finance Reference' },
      { key: 'legacyAssetNumber', header: 'Legacy Asset Number' },
      { key: 'createdAt',      header: 'Created' },
      { key: 'updatedAt',      header: 'Updated' },
    ]);
}
