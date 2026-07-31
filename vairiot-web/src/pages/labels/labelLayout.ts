import { formatHri } from 'vairiot-shared';

import type { Company } from '@/hooks/useOnboarding';
import type { Asset } from '@/types';

/* ---------- Barcode standards ---------- */

export type BarcodeType =
  | 'qrcode'
  | 'datamatrix'
  | 'pdf417'
  | 'azteccode'
  | 'code128'
  | 'code39'
  | 'ean13'
  | 'upca'
  | 'itf14'
  | 'code93';

export const BARCODE_TYPES: { value: BarcodeType; label: string; group: '2D' | '1D' }[] = [
  { value: 'qrcode',     label: 'QR Code',     group: '2D' },
  { value: 'datamatrix', label: 'Data Matrix', group: '2D' },
  { value: 'pdf417',     label: 'PDF417',      group: '2D' },
  { value: 'azteccode',  label: 'Aztec',       group: '2D' },
  { value: 'code128',    label: 'Code 128',    group: '1D' },
  { value: 'code39',     label: 'Code 39',     group: '1D' },
  { value: 'code93',     label: 'Code 93',     group: '1D' },
  { value: 'ean13',      label: 'EAN-13',      group: '1D' },
  { value: 'upca',       label: 'UPC-A',       group: '1D' },
  { value: 'itf14',      label: 'ITF-14',      group: '1D' },
];

export const is2D = (t: BarcodeType) =>
  t === 'qrcode' || t === 'datamatrix' || t === 'pdf417' || t === 'azteccode';

/* ---------- Content field toggles ---------- */

export type ContentFields = {
  name: boolean;
  assetNumber: boolean;
  serialNumber: boolean;
  barcode: boolean;
  site: boolean;
  category: boolean;
  companyName: boolean;
  companyAddress: boolean;
  companyEmail: boolean;
  companyLogo: boolean;
};

export const DEFAULT_FIELDS: ContentFields = {
  name: true,
  assetNumber: true,
  serialNumber: true,
  barcode: false,
  site: true,
  category: false,
  companyName: false,
  companyAddress: false,
  companyEmail: false,
  companyLogo: false,
};

export const FIELD_LABELS: { key: keyof ContentFields; label: string }[] = [
  { key: 'name',           label: 'Asset name' },
  { key: 'assetNumber',    label: 'Asset number' },
  { key: 'serialNumber',   label: 'Serial number' },
  { key: 'barcode',        label: 'Barcode value' },
  { key: 'site',           label: 'Site' },
  { key: 'category',       label: 'Category' },
  { key: 'companyName',    label: 'Company name' },
  { key: 'companyAddress', label: 'Company address' },
  { key: 'companyEmail',   label: 'Company email' },
  { key: 'companyLogo',    label: 'Company logo' },
];

export function formatCompanyAddress(c: Company | null | undefined): string {
  if (!c) return '';
  return [c.addressLine1, c.addressLine2, c.city, c.stateProvince, c.postalCode, c.country]
    .filter(Boolean)
    .join(', ');
}

/* ---------- Freeform layout ---------- */

// One entry per movable label element. 'barcode' is the symbol itself;
// 'barcodeValue' is the human-readable "BC:" text line.
export type ElementKey =
  | 'barcode' | 'logo'
  | 'name' | 'assetNumber' | 'iar' | 'serialNumber' | 'barcodeValue'
  | 'site' | 'category' | 'companyName' | 'companyAddress' | 'companyEmail';

// Positions are top-left corners stored as fractions of the label's
// width/height so a template scales across label sizes. null = auto layout.
export type LayoutMap = Partial<Record<ElementKey, { x: number; y: number }>>;

export type LabelElement = {
  key: ElementKey;
  kind: 'barcode' | 'logo' | 'text';
  text?: string;
  font?: number;   // px at 1x
  bold?: boolean;
  color?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LabelDesign = {
  barcodeType: BarcodeType;
  fields: ContentFields;
  logoScale: number;          // logo height as a fraction of inner label height
  layout: LayoutMap | null;   // null → automatic layout
};

export type LabelLayoutInput = {
  asset: Asset;
  company: Company | null | undefined;
  design: LabelDesign;
  widthPx: number;
  heightPx: number;
  logoAspect: number | null;  // logo naturalWidth / naturalHeight, null if none
};

type LineKind = 'title' | 'number' | 'muted' | 'brand';

const COLOR_FOR: Record<LineKind, string> = {
  title:  '#2B3132',
  number: '#615AA0',
  brand:  '#2B3132',
  muted:  '#6b7280',
};

function buildLines(asset: Asset, fields: ContentFields, company: Company | null | undefined) {
  const companyAddress = formatCompanyAddress(company);
  const lines: { key: ElementKey; text: string; kind: LineKind }[] = [];
  if (fields.name) lines.push({ key: 'name', text: asset.name, kind: 'title' });
  if (fields.assetNumber) lines.push({ key: 'assetNumber', text: asset.assetNumber, kind: 'number' });
  if (asset.individualAssetReference) lines.push({ key: 'iar', text: formatHri(asset.individualAssetReference), kind: 'number' });
  if (fields.serialNumber && asset.serialNumber) lines.push({ key: 'serialNumber', text: `SN: ${asset.serialNumber}`, kind: 'muted' });
  if (fields.barcode && asset.barcode) lines.push({ key: 'barcodeValue', text: `BC: ${asset.barcode}`, kind: 'muted' });
  if (fields.site && asset.site) lines.push({ key: 'site', text: asset.site.name, kind: 'muted' });
  if (fields.category && asset.category) lines.push({ key: 'category', text: asset.category.name, kind: 'muted' });
  if (fields.companyName && company?.legalName) lines.push({ key: 'companyName', text: company.tradingName || company.legalName, kind: 'brand' });
  if (fields.companyAddress && companyAddress) lines.push({ key: 'companyAddress', text: companyAddress, kind: 'muted' });
  if (fields.companyEmail && company?.primaryContactEmail) lines.push({ key: 'companyEmail', text: company.primaryContactEmail, kind: 'muted' });
  return lines;
}

/**
 * Compute the positioned elements of a label at 1× (CSS px).
 * Auto layout mirrors the historical behaviour: 2D symbols sit left of a text
 * stack, 1D symbols run along the bottom. When `design.layout` provides a
 * position for an element it overrides the automatic one (fractional coords).
 */
export function computeLabelElements(input: LabelLayoutInput): LabelElement[] {
  const { asset, company, design, widthPx, heightPx, logoAspect } = input;
  const { barcodeType, fields, logoScale } = design;
  const wide2D = is2D(barcodeType);

  const padding = Math.max(3, Math.round(Math.min(widthPx, heightPx) * 0.04));
  const innerW = widthPx - padding * 2;
  const innerH = heightPx - padding * 2;
  const gap = Math.max(2, Math.round(innerW * 0.015));

  const lines = buildLines(asset, fields, company);

  // Barcode geometry (same heuristics as before).
  const longestTitle = lines.filter(l => l.kind === 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const longestOther = lines.filter(l => l.kind !== 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const minFont = 5;
  const minTextW = Math.max(longestTitle * 0.62 * minFont, longestOther * 0.58 * (minFont * 0.82));
  const bcIdeal = Math.min(innerH, innerW - minTextW - gap);
  const bcMin = Math.round(innerH * 0.3);
  const bcSize2D = Math.round(Math.max(bcMin, Math.min(innerH, bcIdeal)));
  const bc1DH = Math.min(Math.round(innerH * 0.35), 50);

  const textAreaW = wide2D ? innerW - bcSize2D - gap : innerW;

  // Logo box: height driven by logoScale, clamped so it also fits the text column.
  const showLogo = fields.companyLogo && logoAspect != null && logoAspect > 0;
  let logoH = 0;
  let logoW = 0;
  if (showLogo) {
    logoH = Math.max(6, Math.min(innerH, Math.round(innerH * logoScale)));
    logoW = Math.round(logoH * logoAspect);
    if (logoW > textAreaW) {
      logoW = textAreaW;
      logoH = Math.round(logoW / logoAspect);
    }
  }
  const logoGap = showLogo ? 2 : 0;

  const textAreaH = (wide2D ? innerH : innerH - bc1DH - 2) - logoH - logoGap;

  // Auto-fit font so each line fits its row and the stack fits the area.
  const maxFontByTitleW = longestTitle > 0 ? textAreaW / (longestTitle * 0.62) : 99;
  const maxFontByOtherW = longestOther > 0 ? textAreaW / (longestOther * 0.58) : 99;
  const maxFontByW = Math.min(maxFontByTitleW, maxFontByOtherW / 0.82);
  const totalWeight = lines.reduce((s, l) => s + (l.kind === 'title' ? 1 : 0.82), 0);
  const maxFontByH = totalWeight > 0 ? textAreaH / (totalWeight * 1.15) : 12;
  const fontSize = Math.max(3, Math.min(maxFontByH, maxFontByW, 14));
  const titleFont = fontSize;
  const otherFont = Math.max(3, Math.round(fontSize * 0.82));

  const elements: LabelElement[] = [];

  // Barcode element.
  if (wide2D) {
    elements.push({
      key: 'barcode', kind: 'barcode',
      x: padding,
      y: padding + Math.max(0, (innerH - bcSize2D) / 2),
      w: bcSize2D, h: bcSize2D,
    });
  } else {
    elements.push({
      key: 'barcode', kind: 'barcode',
      x: padding,
      y: heightPx - padding - bc1DH,
      w: innerW, h: bc1DH,
    });
  }

  // Text stack (logo on top), vertically centred in its area.
  const textX = wide2D ? padding + bcSize2D + gap : padding;
  const stackH = logoH + logoGap + lines.reduce(
    (s, l) => s + (l.kind === 'title' ? titleFont : otherFont) * 1.15, 0);
  const availH = wide2D ? innerH : innerH - bc1DH - 2;
  let y = padding + Math.max(0, (availH - stackH) / 2);

  if (showLogo) {
    elements.push({ key: 'logo', kind: 'logo', x: textX, y, w: logoW, h: logoH });
    y += logoH + logoGap;
  }

  for (const l of lines) {
    const fs = l.kind === 'title' ? titleFont : otherFont;
    const estW = Math.min(textAreaW, l.text.length * (l.kind === 'title' ? 0.62 : 0.58) * fs);
    elements.push({
      key: l.key, kind: 'text', text: l.text,
      font: fs, bold: l.kind === 'title', color: COLOR_FOR[l.kind],
      x: textX, y, w: Math.max(4, estW), h: fs * 1.15,
    });
    y += fs * 1.15;
  }

  // Freeform overrides: fractional top-left positions, clamped on-label.
  const layout = design.layout;
  if (layout) {
    for (const el of elements) {
      const pos = layout[el.key];
      if (!pos) continue;
      el.x = Math.min(Math.max(0, pos.x * widthPx), Math.max(0, widthPx - el.w));
      el.y = Math.min(Math.max(0, pos.y * heightPx), Math.max(0, heightPx - el.h));
    }
  }

  return elements;
}

/* ---------- Canvas renderer (saved to assets / high-res output) ---------- */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function renderLabelToDataUrl(
  input: LabelLayoutInput,
  barcodeDataUrl: string,
  logoDataUrl: string | null,
): Promise<string> {
  const scale = 3;
  const w = Math.round(input.widthPx * scale);
  const h = Math.round(input.heightPx * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const elements = computeLabelElements(input);
  const barcodeImg = await loadImage(barcodeDataUrl);
  const logoImg = logoDataUrl ? await loadImage(logoDataUrl).catch(() => null) : null;

  for (const el of elements) {
    if (el.kind === 'barcode') {
      ctx.drawImage(barcodeImg, el.x * scale, el.y * scale, el.w * scale, el.h * scale);
    } else if (el.kind === 'logo') {
      if (logoImg) ctx.drawImage(logoImg, el.x * scale, el.y * scale, el.w * scale, el.h * scale);
    } else if (el.kind === 'text' && el.text) {
      const fs = (el.font ?? 8) * scale;
      ctx.font = `${el.bold ? '700' : '400'} ${fs}px Montserrat, sans-serif`;
      ctx.fillStyle = el.color ?? '#2B3132';
      // Draw with the same top-left anchor as the DOM preview.
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(el.text, el.x * scale, el.y * scale + fs, w - el.x * scale);
    }
  }

  return canvas.toDataURL('image/png');
}
