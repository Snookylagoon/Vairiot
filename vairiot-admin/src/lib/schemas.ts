import { z } from 'zod';

export const loginSchema = z.object({
  tenantId: z.string().min(1, 'Organisation ID is required'),
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginFormData = z.infer<typeof loginSchema>;
