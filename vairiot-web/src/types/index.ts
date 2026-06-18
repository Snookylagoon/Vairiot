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
