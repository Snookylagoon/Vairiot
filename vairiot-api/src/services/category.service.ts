import { prisma } from '../lib/prisma';

export async function listCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId },
    include: { children: true, _count: { select: { assets: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createCategory(tenantId: string, data: { name: string; description?: string; parentId?: string }) {
  return prisma.category.create({
    data: { tenantId, ...data },
  });
}

export async function updateCategory(tenantId: string, id: string, data: { name?: string; description?: string; parentId?: string }) {
  const existing = await prisma.category.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(tenantId: string, id: string) {
  const existing = await prisma.category.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error('NOT_FOUND');
  const assetCount = await prisma.asset.count({ where: { categoryId: id } });
  if (assetCount > 0) throw new Error('HAS_ASSETS');
  return prisma.category.delete({ where: { id } });
}
