export interface DepreciationRow {
  assetNumber: string; name: string; category: string | null; site: string | null;
  status: string; depreciationMethod: string | null; usefulLifeMonths: number | null;
  depreciationStartDate: string | null; capitalizedCost: number;
  monthlyDepreciation: number; accumulatedDepreciation: number; netBookValue: number;
  residualValue: number;
}

export interface FixedAssetRow {
  assetNumber: string; name: string; category: string | null; site: string | null;
  location: string | null; status: string; condition: string;
  serialNumber: string | null; manufacturer: string | null;
  purchaseDate: string | null; purchaseCost: number;
  capitalizedCost: number; accumulatedDepreciation: number; netBookValue: number;
  registeredDate: string;
}

export interface DisposalRow {
  assetNumber: string; assetName: string; category: string | null; site: string | null;
  disposalDate: string; disposalMethod: string; disposalValue: number;
  netBookValueAtDisposal: number; gainLoss: number;
  reason: string | null; approvedBy: string | null;
}

export interface DisposalReport {
  rows: DisposalRow[];
  totals: { count: number; totalDisposalValue: number; totalNBV: number; totalGainLoss: number };
}

export interface AgingRow {
  assetNumber: string; name: string; category: string | null; site: string | null;
  status: string; purchaseDate: string; purchaseCost: number; ageMonths: number;
}

export interface AgingReport {
  rows: AgingRow[];
  buckets: Record<string, number>;
  totalAssets: number;
}

export interface MaintenanceCostRow {
  assetNumber: string; assetName: string; category: string | null;
  maintenanceType: string; vendor: string | null; cost: number;
  completedDate: string | null;
}

export interface MaintenanceCostReport {
  rows: MaintenanceCostRow[];
  totalCost: number;
  totalEvents: number;
}
