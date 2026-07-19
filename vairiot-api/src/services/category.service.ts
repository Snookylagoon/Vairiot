import { NotFoundError, ConflictError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export async function listCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId },
    include: { children: true, _count: { select: { assets: true } } },
    orderBy: { name: 'asc' },
    take: 500,
  });
}

export async function createCategory(tenantId: string, data: { name: string; description?: string; parentId?: string }) {
  return prisma.category.create({
    data: { tenantId, ...data },
  });
}

export async function updateCategory(tenantId: string, id: string, data: { name?: string; description?: string; parentId?: string }) {
  const existing = await prisma.category.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Category not found');
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(tenantId: string, id: string) {
  const existing = await prisma.category.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Category not found');
  const assetCount = await prisma.asset.count({ where: { categoryId: id } });
  if (assetCount > 0) throw new ConflictError('Category has assets assigned — reassign them first', 'HAS_ASSETS');
  return prisma.category.delete({ where: { id } });
}
