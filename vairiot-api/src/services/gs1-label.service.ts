import { assetDigitalLink, buildGiai, formatHri, gs1128ElementString } from 'vairiot-shared';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAssetEvent } from './asset-event.service';
import { getIdentification } from './gs1-identification.service';

/**
 * Compute label payloads for a set of assets and record the prints.
 * Rendering happens on the client/device (offline capable); the server is the
 * source of truth for what the QR must contain.
 */
export async function recordLabelPrints(
  tenantId: string,
  actorId: string,
  input: {
    assetIds: string[];
    templateCode: string;
    symbology?: 'QR' | 'GS1_128' | 'DATAMATRIX';
    deviceId?: string;
    printerId?: string;
  },
) {
  if (!input.assetIds?.length || input.assetIds.length > 200) {
    throw new ValidationError('assetIds must contain between 1 and 200 ids');
  }
  const ident = await getIdentification(tenantId);
  const assets = await prisma.asset.findMany({
    where: { id: { in: input.assetIds }, tenantId, deletedAt: null },
  });
  if (assets.length !== input.assetIds.length) {
    throw new NotFoundError('One or more assets not found');
  }
  const unidentified = assets.filter((a) => !a.individualAssetReference);
  if (unidentified.length > 0) {
    throw new ConflictError(
      `${unidentified.length} asset(s) have no individual asset reference yet`,
      'ASSET_NOT_IDENTIFIED',
    );
  }

  const symbology = input.symbology ?? 'QR';
  const prints = [];
  for (const asset of assets) {
    const iar = asset.individualAssetReference!;
    const giai =
      asset.giai ?? (ident.activePrefix ? buildGiai(ident.activePrefix.prefix, iar) : null);
    const payload =
      symbology === 'GS1_128'
        ? gs1128ElementString({ mode: ident.mode, giai, iar })
        : assetDigitalLink(
            { mode: ident.mode, giai, iar, tenantSlug: ident.slug },
            ident.digitalLinkHost,
          );
    const hri = formatHri(iar, ident.tenantMark ?? '');
    const print = await prisma.labelPrint.create({
      data: {
        tenantId,
        assetId: asset.id,
        templateCode: input.templateCode,
        symbology,
        payload,
        hri,
        printedBy: actorId,
        deviceId: input.deviceId ?? null,
        printerId: input.printerId ?? null,
      },
    });
    prints.push({
      printId: print.id,
      assetId: asset.id,
      payload,
      hri,
      machineLine: ident.mode === 'GS1' && giai ? giai : iar,
      // Error correction M by default; Q for harsh environments is a
      // template-level choice on the client.
      ecc: 'M' as const,
    });
  }
  return { prints };
}

/**
 * Mandatory workflow step (spec §4.4): after printing and before applying,
 * the label is re-scanned and the decoded payload must equal the printed one.
 */
export async function markScanVerified(
  tenantId: string,
  actorId: string,
  printId: string,
  scannedPayload: string,
) {
  const print = await prisma.labelPrint.findFirst({ where: { id: printId, tenantId } });
  if (!print) throw new NotFoundError('Label print not found');
  if (scannedPayload.trim() !== print.payload) {
    throw new ConflictError(
      'Scanned payload does not match the printed payload',
      'VERIFY_MISMATCH',
    );
  }
  await prisma.labelPrint.update({ where: { id: print.id }, data: { scanVerified: true } });
  await recordAssetEvent({
    tenantId, assetId: print.assetId, eventType: 'IDENTIFIER_ASSIGNED', actor: actorId,
    source: 'API', payload: { printId, action: 'LABEL_SCAN_VERIFIED' },
  });
  return { scanVerified: true };
}

export async function listLabelPrints(tenantId: string, assetId: string) {
  return prisma.labelPrint.findMany({
    where: { tenantId, assetId },
    orderBy: { printedAt: 'desc' },
    take: 50,
  });
}
