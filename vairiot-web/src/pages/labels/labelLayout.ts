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

export const MM_TO_PX = 3.7795275591; // 96 dpi

// Smallest reliably scannable 2D symbol on a printed label.
export const MIN_BARCODE_MM = 12;

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
  barcode: true,
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
  { key: 'barcode',        label: 'GS1 identifier' },
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

// Per-field text style overrides; anything unset falls back to the automatic
// style (titles bold, auto-fitted font size).
export type TextStyle = { bold?: boolean; italic?: boolean; font?: number };
export type StyleMap = Partial<Record<ElementKey, TextStyle>>;

export type LabelElement = {
  key: ElementKey;
  kind: 'barcode' | 'logo' | 'text';
  text?: string;
  font?: number;   // px at 1x
  bold?: boolean;
  italic?: boolean;
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
  barcodeMm: number | null;   // fixed 2D symbol size in mm; null → automatic
  layout: LayoutMap | null;   // null → automatic layout
  styles?: StyleMap | null;   // per-field bold/italic/font-size overrides
  monochrome?: boolean;       // force solid black text/logo (thermal printers)
};

export type LabelLayoutInput = {
  asset: Asset;
  company: Company | null | undefined;
  design: LabelDesign;
  widthPx: number;
  heightPx: number;
  logoAspect: number | null;  // logo naturalWidth / naturalHeight, null if none
  placeholders?: boolean;     // editor mode: show every enabled field
  tenantMark?: string | null; // per-tenant Vairiot mark shown in the HRI line
};

/** Inner margin of the label — also the inset used by editor align actions. */
export function labelPadding(widthPx: number, heightPx: number): number {
  return Math.max(3, Math.round(Math.min(widthPx, heightPx) * 0.04));
}

type LineKind = 'title' | 'number' | 'muted' | 'brand';

const COLOR_FOR: Record<LineKind, string> = {
  title:  '#2B3132',
  number: '#615AA0',
  brand:  '#2B3132',
  muted:  '#6b7280',
};

// With `placeholders` (used by the layout editor), every ENABLED field emits a
// line even when the sample asset has no value for it — otherwise those fields
// could never be positioned and other assets' labels would ignore the template.
function buildLines(
  asset: Asset,
  fields: ContentFields,
  company: Company | null | undefined,
  placeholders = false,
  tenantMark: string | null = null,
) {
  const companyAddress = formatCompanyAddress(company);
  const val = (v: string | null | undefined, ph: string) => v || (placeholders ? ph : '');
  const lines: { key: ElementKey; text: string; kind: LineKind }[] = [];
  if (fields.name) lines.push({ key: 'name', text: asset.name, kind: 'title' });
  if (fields.assetNumber) lines.push({ key: 'assetNumber', text: asset.assetNumber, kind: 'number' });
  // GS1 identifier line ("GS1 identifier" toggle — replaces the legacy
  // free-text barcode value). The HRI carries the tenant's GS1 Company Prefix
  // once licensed, or the per-tenant Vairiot mark until then, so printed
  // identifiers are distinguishable across tenants.
  const iar = val(asset.individualAssetReference, '100000123454');
  if (fields.barcode && iar) {
    lines.push({ key: 'iar', text: formatHri(iar, tenantMark ?? ''), kind: 'number' });
  }
  const sn = val(asset.serialNumber, 'SN-000000');
  if (fields.serialNumber && sn) lines.push({ key: 'serialNumber', text: `SN: ${sn}`, kind: 'muted' });
  const site = val(asset.site?.name, 'Site');
  if (fields.site && site) lines.push({ key: 'site', text: site, kind: 'muted' });
  const category = val(asset.category?.name, 'Category');
  if (fields.category && category) lines.push({ key: 'category', text: category, kind: 'muted' });
  const companyName = val(company?.tradingName || company?.legalName, 'Company name');
  if (fields.companyName && companyName) lines.push({ key: 'companyName', text: companyName, kind: 'brand' });
  const address = val(companyAddress, 'Company address');
  if (fields.companyAddress && address) lines.push({ key: 'companyAddress', text: address, kind: 'muted' });
  const email = val(company?.primaryContactEmail, 'email@company.com');
  if (fields.companyEmail && email) lines.push({ key: 'companyEmail', text: email, kind: 'muted' });
  return lines;
}

/**
 * Compute the positioned elements of a label at 1× (CSS px).
 * Auto layout mirrors the historical behaviour: 2D symbols sit left of a text
 * stack, 1D symbols run along the bottom. When `design.layout` provides a
 * position for an element it overrides the automatic one (fractional coords).
 */
export function computeLabelElements(input: LabelLayoutInput): LabelElement[] {
  const { asset, company, design, widthPx, heightPx, logoAspect, placeholders, tenantMark } = input;
  const { barcodeType, fields, logoScale } = design;
  const wide2D = is2D(barcodeType);

  const padding = labelPadding(widthPx, heightPx);
  const innerW = widthPx - padding * 2;
  const innerH = heightPx - padding * 2;
  const gap = Math.max(2, Math.round(innerW * 0.015));

  const lines = buildLines(asset, fields, company, placeholders, tenantMark ?? null);

  // Barcode geometry (same heuristics as before).
  const longestTitle = lines.filter(l => l.kind === 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const longestOther = lines.filter(l => l.kind !== 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const minFont = 5;
  const minTextW = Math.max(longestTitle * 0.62 * minFont, longestOther * 0.58 * (minFont * 0.82));
  const bcIdeal = Math.min(innerH, innerW - minTextW - gap);
  const bcMin = Math.round(innerH * 0.3);
  // Fixed size (slider, ≥12 mm) wins over the auto heuristic, clamped on-label.
  const bcSize2D = design.barcodeMm != null
    ? Math.round(Math.min(
        Math.max(design.barcodeMm, MIN_BARCODE_MM) * MM_TO_PX,
        Math.min(innerW, innerH),
      ))
    : Math.round(Math.max(bcMin, Math.min(innerH, bcIdeal)));
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

  // Font sizing. With a custom template layout, fonts are derived from the
  // label geometry alone so every asset's label matches the template — the
  // per-asset auto-fit would otherwise shrink text on assets with longer or
  // more numerous lines (override per field via styles). Automatic layout
  // keeps the classic auto-fit behaviour.
  let titleFont: number;
  let otherFont: number;
  if (design.layout) {
    titleFont = Math.max(5, Math.min(14, Math.round(innerH * 0.13)));
    otherFont = Math.max(4, Math.round(titleFont * 0.82));
  } else {
    const maxFontByTitleW = longestTitle > 0 ? textAreaW / (longestTitle * 0.62) : 99;
    const maxFontByOtherW = longestOther > 0 ? textAreaW / (longestOther * 0.58) : 99;
    const maxFontByW = Math.min(maxFontByTitleW, maxFontByOtherW / 0.82);
    const totalWeight = lines.reduce((s, l) => s + (l.kind === 'title' ? 1 : 0.82), 0);
    const maxFontByH = totalWeight > 0 ? textAreaH / (totalWeight * 1.15) : 12;
    const fontSize = Math.max(3, Math.min(maxFontByH, maxFontByW, 14));
    titleFont = fontSize;
    otherFont = Math.max(3, Math.round(fontSize * 0.82));
  }

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

  // Effective per-line style: explicit overrides win over the auto style.
  const styles = design.styles ?? {};
  const styledLines = lines.map(l => {
    const s = styles[l.key] ?? {};
    return {
      ...l,
      font: s.font ?? (l.kind === 'title' ? titleFont : otherFont),
      bold: s.bold ?? (l.kind === 'title'),
      italic: s.italic ?? false,
    };
  });

  // Text stack (logo on top), vertically centred in its area.
  const textX = wide2D ? padding + bcSize2D + gap : padding;
  const stackH = logoH + logoGap + styledLines.reduce((s, l) => s + l.font * 1.15, 0);
  const availH = wide2D ? innerH : innerH - bc1DH - 2;
  let y = padding + Math.max(0, (availH - stackH) / 2);

  if (showLogo) {
    elements.push({ key: 'logo', kind: 'logo', x: textX, y, w: logoW, h: logoH });
    y += logoH + logoGap;
  }

  for (const l of styledLines) {
    const estW = Math.min(textAreaW, l.text.length * (l.kind === 'title' ? 0.62 : 0.58) * l.font);
    elements.push({
      key: l.key, kind: 'text', text: l.text,
      font: l.font, bold: l.bold, italic: l.italic,
      color: design.monochrome ? '#000000' : COLOR_FOR[l.kind],
      x: textX, y, w: Math.max(4, estW), h: l.font * 1.15,
    });
    y += l.font * 1.15;
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

/** Convert a logo to solid-black artwork for thermal printing: any pixel that
 *  is reasonably opaque and not near-white becomes pure black; the rest goes
 *  transparent. Thermal heads can't dither colour, so mid-tone logos otherwise
 *  print faint or vanish. */
export async function monochromeDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (d[i + 3] > 60 && lum < 220) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
    } else {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Rotate a rendered label PNG — for roll printers whose media orientation
 *  (and driver rotation) doesn't match the page. 90 = clockwise quarter turn,
 *  270 = anticlockwise, 180 = upside down; quarter turns swap the canvas
 *  dimensions. */
export async function rotateDataUrl(dataUrl: string, degrees: 90 | 180 | 270): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const quarter = degrees !== 180;
  canvas.width = quarter ? img.height : img.width;
  canvas.height = quarter ? img.width : img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL('image/png');
}

export type RenderOptions = {
  /** Pixels per CSS px. 3 (≈288 dpi) suits screen/asset storage; use 6+ for
   *  print output so thermal heads don't magnify the raster grid. */
  scale?: number;
  /** Hard-threshold the finished label to pure 1-bit black/white. Kills the
   *  antialiasing greys that thermal printers dither into fuzzy edges. */
  threshold?: boolean;
};

export async function renderLabelToDataUrl(
  input: LabelLayoutInput,
  barcodeDataUrl: string,
  logoDataUrl: string | null,
  options: RenderOptions = {},
): Promise<string> {
  const scale = options.scale ?? 3;
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
      // Nearest-neighbour keeps barcode module edges razor sharp when upscaling.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(barcodeImg, el.x * scale, el.y * scale, el.w * scale, el.h * scale);
      ctx.imageSmoothingEnabled = true;
    } else if (el.kind === 'logo') {
      if (logoImg) ctx.drawImage(logoImg, el.x * scale, el.y * scale, el.w * scale, el.h * scale);
    } else if (el.kind === 'text' && el.text) {
      const fs = (el.font ?? 8) * scale;
      ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? '700' : '400'} ${fs}px Montserrat, sans-serif`;
      ctx.fillStyle = el.color ?? '#2B3132';
      // Draw with the same top-left anchor as the DOM preview.
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(el.text, el.x * scale, el.y * scale + fs, w - el.x * scale);
    }
  }

  if (options.threshold) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = lum < 180 ? 0 : 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}
