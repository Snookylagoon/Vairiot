import { prisma } from '../lib/prisma';

export async function listSites(tenantId: string) {
  return prisma.site.findMany({
    where: { tenantId },
    include: { locations: true, _count: { select: { assets: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createSite(tenantId: string, data: { name: string; address?: string; city?: string; country?: string }) {
  return prisma.site.create({ data: { tenantId, ...data } });
}

export async function listLocations(siteId: string, tenantId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error('NOT_FOUND');
  return prisma.location.findMany({
    where: { siteId },
    include: { children: true, _count: { select: { assets: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createLocation(siteId: string, tenantId: string, data: { name: string; type?: string; parentId?: string }) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error('NOT_FOUND');
  return prisma.location.create({ data: { siteId, ...data } });
}

export async function deleteSite(siteId: string, tenantId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, include: { _count: { select: { assets: true } } } });
  if (!site) throw new Error('NOT_FOUND');
  if (site._count.assets > 0) throw new Error('HAS_ASSETS');
  await prisma.location.deleteMany({ where: { siteId } });
  return prisma.site.delete({ where: { id: siteId } });
}
