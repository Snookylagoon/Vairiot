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
  purchaseCost?: string;
  purchaseDate?: string;
  supplier?:     string;
  purchaseOrderNumber?: string;
  invoiceNumber?: string;
  invoiceDate?:  string;
  receiptDate?:  string;
  capitalizationDate?: string;
  freightCost?:  string;
  installationCost?: string;
  customsDuties?: string;
  otherCapitalizedCosts?: string;
  residualValue?: string;
  depreciationMethod?: string;
  usefulLifeMonths?: number;
  depreciationStartDate?: string;
  depreciation?: Depreciation;
  warrantyExpiry?: string;
  notes?:       string;
  disposal?:    Disposal | null;
  deletedAt?:   string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface PaginatedResponse<T> {
  total:      number;
  page:       number;
  pageSize:   number;
  totalPages: number;
  [key: string]: T[] | number;
}

export interface AssetListResponse extends PaginatedResponse<Asset> {
  assets: Asset[];
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

export interface DocumentRecord {
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

export interface MaintenanceListResponse extends PaginatedResponse<MaintenanceEvent> {
  events: MaintenanceEvent[];
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

export interface TransferListResponse extends PaginatedResponse<Transfer> {
  transfers: Transfer[];
}

export interface ExceptionsSummary {
  missingDocuments:       number;
  overdueMaintenanceCount: number;
  expiredWarrantyCount:   number;
  unlocatedAssetCount:    number;
}

export interface TimelineEntry {
  id: string;
  type: string;
  date: string;
  summary: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AlertSubscription {
  id: string;
  exceptionType: string;
  channel: string;
  frequency: string;
  active: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdBy: string;
  createdAt: string;
}

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

export interface ImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

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
  missingDocumentAssets: Array<{
    id: string; assetNumber: string; name: string;
  }>;
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
