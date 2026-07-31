import { Gs1Error } from './errors.js';
import type { TenantIdMode } from './identifier.js';

export type EpcScheme = 'GIAI96' | 'GIAI202' | 'TID96';

export const GIAI96_HEADER = 0x34;
export const GIAI202_HEADER = 0x38;

type Partition = { cpBits: number; cpDigits: number; refBits: number; refMaxDigits: number };

export const GIAI96_PARTITIONS: Record<number, Partition> = {
  0: { cpBits: 40, cpDigits: 12, refBits: 42, refMaxDigits: 13 },
  1: { cpBits: 37, cpDigits: 11, refBits: 45, refMaxDigits: 14 },
  2: { cpBits: 34, cpDigits: 10, refBits: 48, refMaxDigits: 15 },
  3: { cpBits: 30, cpDigits: 9, refBits: 52, refMaxDigits: 16 },
  4: { cpBits: 27, cpDigits: 8, refBits: 55, refMaxDigits: 17 },
  5: { cpBits: 24, cpDigits: 7, refBits: 58, refMaxDigits: 18 },
  6: { cpBits: 20, cpDigits: 6, refBits: 62, refMaxDigits: 19 },
};

const PARTITION_BY_CP_LEN = new Map(
  Object.entries(GIAI96_PARTITIONS).map(([p, v]) => [v.cpDigits, Number(p)]),
);

export function encodeGiai96(companyPrefix: string, iar: string, filterValue = 0): string {
  if (!/^\d+$/.test(companyPrefix) || !/^\d+$/.test(iar)) {
    throw new Gs1Error('GIAI96_REQUIRES_NUMERIC', `${companyPrefix}.${iar}`);
  }
  if (iar.startsWith('0')) throw new Gs1Error('GIAI96_LEADING_ZERO', iar);
  const partition = PARTITION_BY_CP_LEN.get(companyPrefix.length);
  if (partition === undefined) throw new Gs1Error('BAD_COMPANY_PREFIX_LENGTH', companyPrefix);
  const p = GIAI96_PARTITIONS[partition];
  if (iar.length > p.refMaxDigits) throw new Gs1Error('REF_TOO_LONG', iar);
  if (filterValue < 0 || filterValue > 7) throw new Gs1Error('BAD_FILTER', String(filterValue));
  const refValue = BigInt(iar);
  if (refValue >= 1n << BigInt(p.refBits)) throw new Gs1Error('REF_OVERFLOW', iar);

  const bits =
    GIAI96_HEADER.toString(2).padStart(8, '0') +
    filterValue.toString(2).padStart(3, '0') +
    partition.toString(2).padStart(3, '0') +
    BigInt(companyPrefix).toString(2).padStart(p.cpBits, '0') +
    refValue.toString(2).padStart(p.refBits, '0');

  if (bits.length !== 96) throw new Gs1Error('BIT_LENGTH', String(bits.length));
  return BigInt('0b' + bits).toString(16).toUpperCase().padStart(24, '0');
}

export function decodeGiai96(hex: string): {
  filterValue: number;
  partition: number;
  companyPrefix: string;
  individualAssetReference: string;
} {
  if (!/^[0-9A-Fa-f]{24}$/.test(hex)) throw new Gs1Error('BAD_EPC_HEX', hex);
  const bits = BigInt('0x' + hex).toString(2).padStart(96, '0');
  if (parseInt(bits.slice(0, 8), 2) !== GIAI96_HEADER) throw new Gs1Error('NOT_GIAI96', hex);
  const filterValue = parseInt(bits.slice(8, 11), 2);
  const partition = parseInt(bits.slice(11, 14), 2);
  const p = GIAI96_PARTITIONS[partition];
  if (!p) throw new Gs1Error('BAD_PARTITION', String(partition));
  const cp = BigInt('0b' + bits.slice(14, 14 + p.cpBits)).toString().padStart(p.cpDigits, '0');
  const iar = BigInt('0b' + bits.slice(14 + p.cpBits, 14 + p.cpBits + p.refBits)).toString();
  return { filterValue, partition, companyPrefix: cp, individualAssetReference: iar };
}

export const epcTagUri = (cp: string, iar: string, f = 0): string =>
  `urn:epc:tag:giai-96:${f}.${cp}.${iar}`;
export const epcPureIdentityUri = (cp: string, iar: string): string =>
  `urn:epc:id:giai:${cp}.${iar}`;

/** INTERNAL-mode EPC: the tag's own 96-bit serialised TID.
 *  E2h is permanently reserved in the EPC header table precisely so TID content can never be
 *  mistaken for a GS1 EPC — the scheme is self-declaring. */
export function tid96Epc(tidHex: string): string {
  const t = tidHex.trim().toUpperCase().slice(0, 24);
  if (t.length !== 24) throw new Gs1Error('TID_TOO_SHORT', tidHex);
  if (!/^E2/.test(t)) throw new Gs1Error('TID_NOT_SERIALISED', tidHex);
  if (!/^[0-9A-F]{24}$/.test(t)) throw new Gs1Error('BAD_TID_HEX', tidHex);
  return t;
}

export const isInternalEpc = (hex: string): boolean => /^E2[0-9A-F]{22}$/i.test(hex);

export function chooseEpc(opts: {
  mode: TenantIdMode;
  companyPrefix?: string | null;
  iar: string;
  tidHex: string;
  filterValue?: number;
}): { epcHex: string; scheme: EpcScheme } {
  if (opts.mode === 'GS1') {
    if (!opts.companyPrefix) throw new Gs1Error('GS1_MODE_WITHOUT_PREFIX', '');
    return {
      epcHex: encodeGiai96(opts.companyPrefix, opts.iar, opts.filterValue ?? 0),
      scheme: 'GIAI96',
    };
  }
  return { epcHex: tid96Epc(opts.tidHex), scheme: 'TID96' };
}
