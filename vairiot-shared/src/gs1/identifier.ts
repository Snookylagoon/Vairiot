import { Gs1Error } from './errors.js';

// Isomorphic — runs unchanged on the server, in the browser and in a WebView.
// No Node-only APIs; BigInt only.

export const MARKER_SERVER = '1' as const;
export const MARKER_STANDALONE = '2' as const;
export const IAR_LENGTH = 12;
export const BODY_WIDTH = 10;
export const STANDALONE_SEQ_WIDTH = 8;

export type AllocationAuthority = 'SERVER' | 'STANDALONE';
export type TenantIdMode = 'INTERNAL' | 'GS1';

/** GS1 modulo-10 check digit. Weights 3,1,3,1… from the rightmost body digit. */
export function gs1CheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Gs1Error('CHECK_DIGIT_NON_NUMERIC', body);
  let total = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    total += Number(body[i]) * w;
  }
  return (10 - (total % 10)) % 10;
}

/** Server-allocated IAR from a sequence value. */
export function buildIarServer(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence >= 10 ** BODY_WIDTH) {
    throw new Gs1Error('SEQUENCE_OUT_OF_RANGE', String(sequence));
  }
  const body = MARKER_SERVER + String(sequence).padStart(BODY_WIDTH, '0');
  return body + String(gs1CheckDigit(body));
}

/** Device-only IAR from a workspace number and a device-local sequence. */
export function buildIarStandalone(workspace: number, sequence: number): string {
  if (!Number.isInteger(workspace) || workspace < 1 || workspace > 99) {
    throw new Gs1Error('WORKSPACE_OUT_OF_RANGE', String(workspace));
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence >= 10 ** STANDALONE_SEQ_WIDTH) {
    throw new Gs1Error('SEQUENCE_OUT_OF_RANGE', String(sequence));
  }
  const body =
    MARKER_STANDALONE +
    String(workspace).padStart(2, '0') +
    String(sequence).padStart(STANDALONE_SEQ_WIDTH, '0');
  return body + String(gs1CheckDigit(body));
}

export function isValidIar(iar: string): boolean {
  return (
    iar.length === IAR_LENGTH &&
    /^\d+$/.test(iar) &&
    (iar[0] === MARKER_SERVER || iar[0] === MARKER_STANDALONE) &&
    Number(iar[IAR_LENGTH - 1]) === gs1CheckDigit(iar.slice(0, IAR_LENGTH - 1))
  );
}

export function iarAuthority(iar: string): AllocationAuthority {
  if (!isValidIar(iar)) throw new Gs1Error('BAD_IAR', iar);
  return iar[0] === MARKER_SERVER ? 'SERVER' : 'STANDALONE';
}

export function buildGiai(companyPrefix: string, iar: string): string {
  if (!isValidIar(iar)) throw new Gs1Error('BAD_IAR', iar);
  if (!/^\d{6,12}$/.test(companyPrefix)) throw new Gs1Error('BAD_COMPANY_PREFIX', companyPrefix);
  const giai = companyPrefix + iar;
  if (giai.length > 30) throw new Gs1Error('GIAI_TOO_LONG', giai);
  return giai;
}

/** Label form, grouped 1-5-5-1. tenantMark is presentation only. */
export function formatHri(iar: string, tenantMark = ''): string {
  const grouped = `${iar[0]} ${iar.slice(1, 6)} ${iar.slice(6, 11)} ${iar[11]}`;
  return (tenantMark ? `${tenantMark} ${grouped}` : grouped).trim();
}

/** Accepts the grouped HRI or the raw IAR; returns the raw IAR or throws. */
export function parseHri(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (!isValidIar(digits)) throw new Gs1Error('BAD_IAR', input);
  return digits;
}

/** Normalise GTIN-8/12/13/14 to the 14-digit AI (01) form and verify the check digit. */
export function toGtin14(input: string): string {
  const g = input.replace(/\s/g, '').padStart(14, '0');
  if (!/^\d{14}$/.test(g)) throw new Gs1Error('BAD_GTIN', input);
  if (Number(g[13]) !== gs1CheckDigit(g.slice(0, 13))) throw new Gs1Error('GTIN_CHECK_DIGIT', input);
  return g;
}
