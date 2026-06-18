import { prisma } from '../lib/prisma';

export interface CustomFieldInput {
  name: string;
  label: string;
  fieldType?: string;
  required?: boolean;
  options?: string[];
  sortOrder?: number;
}

const VALID_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const;

export async function listCustomFields(tenantId: string) {
  return prisma.customFieldDefinition.findMany({
    where: { tenantId, active: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createCustomField(tenantId: string, input: CustomFieldInput) {
  const fieldType = input.fieldType ?? 'text';
  if (!VALID_TYPES.includes(fieldType as any)) throw new Error('INVALID_TYPE');
  if (fieldType === 'select' && (!input.options || input.options.length === 0)) throw new Error('OPTIONS_REQUIRED');

  return prisma.customFieldDefinition.create({
    data: {
      tenantId,
      name: input.name,
      label: input.label,
      fieldType,
      required: input.required ?? false,
      options: input.options ?? [],
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateCustomField(tenantId: string, id: string, input: Partial<CustomFieldInput>) {
  const existing = await prisma.customFieldDefinition.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');

  const data: Record<string, any> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.fieldType !== undefined) {
    if (!VALID_TYPES.includes(input.fieldType as any)) throw new Error('INVALID_TYPE');
    data.fieldType = input.fieldType;
  }
  if (input.required !== undefined) data.required = input.required;
  if (input.options !== undefined) data.options = input.options;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return prisma.customFieldDefinition.update({ where: { id }, data });
}

export async function deleteCustomField(tenantId: string, id: string) {
  const existing = await prisma.customFieldDefinition.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');
  await prisma.customFieldDefinition.update({ where: { id }, data: { active: false } });
}
