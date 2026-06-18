export interface Depreciation {
  capitalizedCost:        number;
  monthlyDepreciation:    number;
  accumulatedDepreciation: number;
  netBookValue:           number;
}

export interface Disposal {
  id:             string;
  disposalDate:   string;
  disposalMethod: string;
  disposalValue?: string;
  disposalReason?: string;
  netBookValueAtDisposal?: string;
  gainLoss?:      string;
  approvedBy?:    string;
  notes?:         string;
  createdBy:      string;
  createdAt:      string;
}

export interface Asset {
  id:           string;
  assetNumber:  string;
  name:         string;
  description?: string;
  status:       string;
  condition:    string;
  serialNumber?: string;
  modelNumber?: string;
  manufacturer?: string;
  barcode?:     string;
  rfidTag?:     string;
  category?:    { id: string; name: string };
  site?:        { id: string; name: string };
  location?:    { id: string; name: string };
  // Financial: Procurement
  purchaseCost?: string;
  purchaseDate?: string;
  supplier?:     string;
  purchaseOrderNumber?: string;
  invoiceNumber?: string;
  invoiceDate?:  string;
  receiptDate?:  string;
  capitalizationDate?: string;
  // Financial: Cost Components
  freightCost?:  string;
  installationCost?: string;
  customsDuties?: string;
  otherCapitalizedCosts?: string;
  // Financial: Valuation
  residualValue?: string;
  // Depreciation
  depreciationMethod?: string;
  usefulLifeMonths?: number;
  depreciationStartDate?: string;
  depreciation?: Depreciation;
  warrantyExpiry?: string;
  notes?:       string;
  // Disposal
  disposal?:    Disposal | null;
  deletedAt?:   string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface AssetListResponse {
  assets:     Asset[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

export interface Category {
  id:   string;
  name: string;
  description?: string;
}

export interface Site {
  id:      string;
  name:    string;
  city?:   string;
  country?: string;
}

export interface Document {
  id:           string;
  documentType: string;
  fileName:     string;
  mimeType:     string;
  sizeBytes:    number;
  notes?:       string;
  createdBy:    string;
  createdAt:    string;
}

export interface MaintenanceEvent {
  id:              string;
  tenantId:        string;
  assetId:         string;
  maintenanceType: string;
  vendor?:         string;
  workOrderNumber?: string;
  cost?:           string;
  description?:    string;
  scheduledDate?:  string;
  completedDate?:  string;
  status:          string;
  notes?:          string;
  createdBy:       string;
  createdAt:       string;
  updatedAt:       string;
  asset?:          { id: string; assetNumber: string; name: string };
}

export interface MaintenanceListResponse {
  events:     MaintenanceEvent[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

export interface Transfer {
  id:             string;
  tenantId:       string;
  assetId:        string;
  fromSiteId?:    string;
  toSiteId?:      string;
  fromLocationId?: string;
  toLocationId?:  string;
  fromCustodian?: string;
  toCustodian?:   string;
  transferDate:   string;
  reason?:        string;
  approvedBy?:    string;
  createdBy:      string;
  createdAt:      string;
  asset?:         { id: string; assetNumber: string; name: string };
}

export interface TransferListResponse {
  transfers:  Transfer[];
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

export interface ExceptionsSummary {
  missingDocuments:       number;
  overdueMaintenanceCount: number;
  expiredWarrantyCount:   number;
  unlocatedAssetCount:    number;
}

// ─── Reports ──────────────────────────────────────────────────────────────────
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

// ─── Timeline ─────────────────────────────────────────────────────────────────
export interface TimelineEntry {
  id: string;
  type: string;
  date: string;
  summary: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
export interface AlertSubscription {
  id: string;
  exceptionType: string;
  channel: string;
  frequency: string;
  active: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdBy: string;
  createdAt: string;
}

// ─── Custom Fields ───────────────────────────────────────────────────────────
export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: string[];
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

// ─── Import ──────────────────────────────────────────────────────────────────
export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ─── Dashboard Charts ────────────────────────────────────────────────────────
export interface AssetStats {
  total: number;
  byStatus: Record<string, number>;
  byCondition: Record<string, number>;
  byCategory: Array<{ name: string; count: number }>;
  bySite: Array<{ name: string; count: number }>;
  valueByCat: Array<{ name: string; value: number }>;
  valueBySite: Array<{ name: string; value: number }>;
  monthlyTrend: Array<{ month: string; count: number; value: number }>;
  totalAssetValue: number;
  totalNetBookValue: number;
  totalMonthlyDepreciation: number;
}

export interface ExceptionsData {
  summary: ExceptionsSummary;
  overdueMaintenanceEvents: Array<{
    id: string; maintenanceType: string; scheduledDate: string; vendor?: string; status: string;
    asset: { id: string; assetNumber: string; name: string };
  }>;
  expiredWarrantyAssets: Array<{
    id: string; assetNumber: string; name: string; warrantyExpiry: string;
  }>;
  unlocatedAssets: Array<{
    id: string; assetNumber: string; name: string;
  }>;
}
