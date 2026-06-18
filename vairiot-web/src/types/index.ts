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
