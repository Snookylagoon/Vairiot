import { prisma } from '../lib/prisma';

import { createAsset, type AssetCreateInput } from './asset.service';

export interface ImportRow {
  name: string;
  description?: string;
  categoryName?: string;
  siteName?: string;
  serialNumber?: string;
  modelNumber?: string;
  manufacturer?: string;
  barcode?: string;
  rfidTag?: string;
  purchaseCost?: string;
  purchaseDate?: string;
  supplier?: string;
  warrantyExpiry?: string;
  condition?: string;
  status?: string;
  notes?: string;
  purchaseOrderNumber?: string;
  invoiceNumber?: string;
  residualValue?: string;
  usefulLifeMonths?: string;
  depreciationMethod?: string;
  depreciationStartDate?: string;
  [key: string]: string | undefined;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export async function bulkImportAssets(
  tenantId: string,
  actorId: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  const categories = await prisma.category.findMany({ where: { tenantId } });
  const sites = await prisma.site.findMany({ where: { tenantId } });
  const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
  const siteMap = new Map(sites.map(s => [s.name.toLowerCase(), s.id]));

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.name || !row.name.trim()) {
      result.errors.push({ row: rowNum, message: 'Name is required' });
      result.skipped++;
      continue;
    }

    try {
      const input: AssetCreateInput = {
        name: row.name.trim(),
        description: row.description?.trim(),
        serialNumber: row.serialNumber?.trim(),
        modelNumber: row.modelNumber?.trim(),
        manufacturer: row.manufacturer?.trim(),
        barcode: row.barcode?.trim(),
        rfidTag: row.rfidTag?.trim(),
        supplier: row.supplier?.trim(),
        notes: row.notes?.trim(),
        condition: row.condition?.trim() || 'good',
        status: row.status?.trim() || 'active',
        purchaseOrderNumber: row.purchaseOrderNumber?.trim(),
        invoiceNumber: row.invoiceNumber?.trim(),
        depreciationMethod: row.depreciationMethod?.trim(),
      };

      if (row.categoryName) {
        const cid = catMap.get(row.categoryName.toLowerCase().trim());
        if (cid) input.categoryId = cid;
      }
      if (row.siteName) {
        const sid = siteMap.get(row.siteName.toLowerCase().trim());
        if (sid) input.siteId = sid;
      }
      if (row.purchaseCost) {
        const v = parseFloat(row.purchaseCost);
        if (!isNaN(v)) input.purchaseCost = v;
      }
      if (row.residualValue) {
        const v = parseFloat(row.residualValue);
        if (!isNaN(v)) input.residualValue = v;
      }
      if (row.usefulLifeMonths) {
        const v = parseInt(row.usefulLifeMonths, 10);
        if (!isNaN(v)) input.usefulLifeMonths = v;
      }
      if (row.purchaseDate) input.purchaseDate = row.purchaseDate;
      if (row.warrantyExpiry) input.warrantyExpiry = row.warrantyExpiry;
      if (row.depreciationStartDate) input.depreciationStartDate = row.depreciationStartDate;

      await createAsset(tenantId, actorId, input);
      result.created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      result.errors.push({ row: rowNum, message: msg });
      result.skipped++;
    }
  }

  return result;
}
