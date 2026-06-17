export interface Asset {
  id:           string;
  assetNumber:  string;
  name:         string;
  description?: string;
  status:       string;
  condition:    string;
  serialNumber?: string;
  barcode?:     string;
  rfidTag?:     string;
  category?:    { id: string; name: string };
  site?:        { id: string; name: string };
  location?:    { id: string; name: string };
  purchaseCost?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
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
