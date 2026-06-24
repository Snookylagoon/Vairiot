import { z } from 'zod';

export const loginSchema = z.object({
  tenantId: z.string().min(1, 'Organisation ID is required'),
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  organisationName: z.string().min(1, 'Organisation name is required'),
  name:             z.string().min(1, 'Your name is required'),
  email:            z.string().email('Enter a valid email address'),
  password:         z.string().min(12, 'Password must be at least 12 characters'),
  confirmPassword:  z.string().min(1, 'Please confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type RegisterFormData = z.infer<typeof registerSchema>;

export const assetSchema = z.object({
  name:           z.string().min(1, 'Asset name is required'),
  description:    z.string().optional(),
  categoryId:     z.string().optional(),
  siteId:         z.string().optional(),
  condition:      z.string().optional(),
  serialNumber:   z.string().optional(),
  modelNumber:    z.string().optional(),
  manufacturer:   z.string().optional(),
  barcode:        z.string().optional(),
  rfidTag:        z.string().optional(),
  // Financial: Procurement
  purchaseCost:   z.string().optional(),
  purchaseDate:   z.string().optional(),
  warrantyExpiry: z.string().optional(),
  supplier:       z.string().optional(),
  purchaseOrderNumber: z.string().optional(),
  invoiceNumber:  z.string().optional(),
  invoiceDate:    z.string().optional(),
  receiptDate:    z.string().optional(),
  capitalizationDate: z.string().optional(),
  // Financial: Cost Components
  freightCost:    z.string().optional(),
  installationCost: z.string().optional(),
  customsDuties:  z.string().optional(),
  otherCapitalizedCosts: z.string().optional(),
  // Financial: Valuation
  residualValue:  z.string().optional(),
  // Depreciation
  depreciationMethod: z.string().optional(),
  usefulLifeMonths: z.string().optional(),
  depreciationStartDate: z.string().optional(),
  notes:          z.string().optional(),
});
export type AssetFormData = z.infer<typeof assetSchema>;

export const disposalSchema = z.object({
  disposalDate:   z.string().min(1, 'Disposal date is required'),
  disposalMethod: z.string().min(1, 'Disposal method is required'),
  disposalValue:  z.string().optional(),
  disposalReason: z.string().optional(),
  approvedBy:     z.string().optional(),
  notes:          z.string().optional(),
});
export type DisposalFormData = z.infer<typeof disposalSchema>;

export const inviteUserSchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  email:    z.string().email('Enter a valid email address'),
  roleId:   z.string().optional(),
});
export type InviteUserFormData = z.infer<typeof inviteUserSchema>;

export const acceptInviteSchema = z.object({
  password:        z.string().min(12, 'Password must be exactly 12 alphanumeric characters'),
  confirmPassword: z.string().min(12, 'Confirm your password'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

export const checkoutSchema = z.object({
  assetId:        z.string().min(1, 'Select an asset'),
  custodianId:    z.string().min(1, 'Custodian is required'),
  expectedReturn: z.string().optional(),
  notes:          z.string().optional(),
});
export type CheckoutFormData = z.infer<typeof checkoutSchema>;

export const categorySchema = z.object({
  name:        z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
});
export type CategoryFormData = z.infer<typeof categorySchema>;

export const apiKeySchema = z.object({
  name:   z.string().min(1, 'Key name is required'),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
});
export type ApiKeyFormData = z.infer<typeof apiKeySchema>;
