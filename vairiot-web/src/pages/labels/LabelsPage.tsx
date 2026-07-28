import bwipjs from 'bwip-js/browser';
import { QrCode, Printer, Search, Check, Settings2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useAssets } from '@/hooks/useAssets';
import { useCompany, type Company } from '@/hooks/useOnboarding';
import { api } from '@/lib/api';
import type { Asset } from '@/types';

/* ---------- Barcode standards ---------- */

type BarcodeType =
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

const BARCODE_TYPES: { value: BarcodeType; label: string; group: '2D' | '1D' }[] = [
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

const is2D = (t: BarcodeType) =>
  t === 'qrcode' || t === 'datamatrix' || t === 'pdf417' || t === 'azteccode';

/* ---------- Avery label presets (dimensions in mm) ---------- */

type SizePreset = {
  value: string;
  label: string;
  w: number;  // mm
  h: number;  // mm
};

const AVERY_PRESETS: SizePreset[] = [
  { value: 'avery-5167', label: 'Avery 5167 — 44.5 × 12.7 mm (80/sheet)', w: 44.5, h: 12.7 },
  { value: 'avery-6570', label: 'Avery 6570 — 31.75 × 19.05 mm (asset)',  w: 31.75, h: 19.05 },
  { value: 'avery-5160', label: 'Avery 5160 / 5260 / 8160 — 66.7 × 25.4 mm', w: 66.7, h: 25.4 },
  { value: 'avery-l7651', label: 'Avery L7651 (EU) — 38.1 × 21.2 mm',      w: 38.1, h: 21.2 },
  { value: 'avery-l7159', label: 'Avery L7159 (EU) — 63.5 × 38.1 mm',      w: 63.5, h: 38.1 },
  { value: 'avery-5163', label: 'Avery 5163 — 101.6 × 50.8 mm (10/sheet)', w: 101.6, h: 50.8 },
  { value: 'avery-l7163', label: 'Avery L7163 (EU) — 99.1 × 38.1 mm',      w: 99.1, h: 38.1 },
];

const MM_TO_PX = 3.7795275591; // 96 dpi

/* ---------- Content field toggles ---------- */

type ContentFields = {
  name: boolean;
  assetNumber: boolean;
  serialNumber: boolean;
  barcode: boolean;
  site: boolean;
  category: boolean;
  companyName: boolean;
  companyAddress: boolean;
  companyEmail: boolean;
};

const DEFAULT_FIELDS: ContentFields = {
  name: true,
  assetNumber: true,
  serialNumber: true,
  barcode: false,
  site: true,
  category: false,
  companyName: false,
  companyAddress: false,
  companyEmail: false,
};

const FIELD_LABELS: { key: keyof ContentFields; label: string }[] = [
  { key: 'name',           label: 'Asset name' },
  { key: 'assetNumber',    label: 'Asset number' },
  { key: 'serialNumber',   label: 'Serial number' },
  { key: 'barcode',        label: 'Barcode value' },
  { key: 'site',           label: 'Site' },
  { key: 'category',       label: 'Category' },
  { key: 'companyName',    label: 'Company name' },
  { key: 'companyAddress', label: 'Company address' },
  { key: 'companyEmail',   label: 'Company email' },
];

function formatCompanyAddress(c: Company | null | undefined): string {
  if (!c) return '';
  return [c.addressLine1, c.addressLine2, c.city, c.stateProvince, c.postalCode, c.country]
    .filter(Boolean)
    .join(', ');
}

/* ---------- Barcode payload helper ---------- */

function barcodePayload(asset: Asset, type: BarcodeType): string {
  // 1D linear codes need a short, numeric or simple-alpha payload.
  // 2D codes can carry the full JSON identifier.
  if (is2D(type)) {
    return JSON.stringify({ id: asset.id, n: asset.assetNumber, name: asset.name });
  }
  // Prefer existing barcode, then serial, then assetNumber.
  const raw = asset.barcode || asset.serialNumber || asset.assetNumber || asset.id;
  // EAN-13 needs 12 digits + check; UPC-A needs 11 digits + check; ITF-14 needs 13 digits + check.
  if (type === 'ean13') return raw.replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  if (type === 'upca')  return raw.replace(/\D/g, '').padStart(11, '0').slice(0, 11);
  if (type === 'itf14') return raw.replace(/\D/g, '').padStart(13, '0').slice(0, 13);
  if (type === 'code39') return raw.toUpperCase().replace(/[^A-Z0-9\-. $/+%]/g, '');
  return raw;
}

/* ---------- Render label to canvas data URL ---------- */

function renderLabelToDataUrl(
  asset: Asset, barcodeDataUrl: string, barcodeType: BarcodeType,
  fields: ContentFields, company: Company | null | undefined,
  widthPx: number, heightPx: number,
): Promise<string> {
  const scale = 3;
  const w = Math.round(widthPx * scale);
  const h = Math.round(heightPx * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const companyAddress = formatCompanyAddress(company);
  const wide2D = is2D(barcodeType);
  const padding = Math.max(3, Math.round(Math.min(widthPx, heightPx) * 0.04)) * scale;
  const gap = Math.max(2, Math.round(widthPx * 0.015)) * scale;
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;

  type LineKind = 'title' | 'number' | 'muted' | 'brand';
  const lines: { text: string; kind: LineKind }[] = [];
  if (fields.name) lines.push({ text: asset.name, kind: 'title' });
  if (fields.assetNumber) lines.push({ text: asset.assetNumber, kind: 'number' });
  if (fields.serialNumber && asset.serialNumber) lines.push({ text: `SN: ${asset.serialNumber}`, kind: 'muted' });
  if (fields.barcode && asset.barcode) lines.push({ text: `BC: ${asset.barcode}`, kind: 'muted' });
  if (fields.site && asset.site) lines.push({ text: asset.site.name, kind: 'muted' });
  if (fields.category && asset.category) lines.push({ text: asset.category.name, kind: 'muted' });
  if (fields.companyName && company?.legalName) lines.push({ text: company.tradingName || company.legalName, kind: 'brand' });
  if (fields.companyAddress && companyAddress) lines.push({ text: companyAddress, kind: 'muted' });
  if (fields.companyEmail && company?.primaryContactEmail) lines.push({ text: company.primaryContactEmail, kind: 'muted' });

  const longestTitle = lines.filter(l => l.kind === 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const longestOther = lines.filter(l => l.kind !== 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const minFont = 5 * scale;
  const minTextW = Math.max(longestTitle * 0.62 * minFont, longestOther * 0.58 * (minFont * 0.82));
  const bcIdeal = Math.min(innerH, innerW - minTextW - gap);
  const bcMin = Math.round(innerH * 0.3);
  const bcSize = Math.round(Math.max(bcMin, Math.min(innerH, bcIdeal)));
  const textAreaW = wide2D ? innerW - bcSize - gap : innerW;
  const textAreaH = innerH;

  const maxFontByTitleW = longestTitle > 0 ? textAreaW / (longestTitle * 0.62) : 99;
  const maxFontByOtherW = longestOther > 0 ? textAreaW / (longestOther * 0.58) : 99;
  const maxFontByW = Math.min(maxFontByTitleW, maxFontByOtherW / 0.82);
  const totalWeight = lines.reduce((s, l) => s + (l.kind === 'title' ? 1 : 0.82), 0);
  const maxFontByH = totalWeight > 0 ? textAreaH / (totalWeight * 1.15) : 12 * scale;
  const fontSize = Math.max(3 * scale, Math.min(maxFontByH, maxFontByW, 14 * scale));
  const otherFont = Math.max(3 * scale, Math.round(fontSize * 0.82));

  const colorFor = (kind: LineKind) => {
    switch (kind) { case 'title': return '#2B3132'; case 'number': return '#615AA0'; case 'brand': return '#2B3132'; case 'muted': return '#6b7280'; }
  };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (wide2D) {
        const bcY = padding + Math.max(0, (innerH - bcSize) / 2);
        ctx.drawImage(img, padding, bcY, bcSize, bcSize);
      }
      const textX = wide2D ? padding + bcSize + gap : padding;
      let y = padding;
      const totalTextH = lines.reduce((s, l) => s + (l.kind === 'title' ? fontSize : otherFont) * 1.15, 0);
      y += Math.max(0, (textAreaH - totalTextH) / 2);

      for (const l of lines) {
        const fs = l.kind === 'title' ? fontSize : otherFont;
        ctx.font = `${l.kind === 'title' ? '700' : '400'} ${fs}px Montserrat, sans-serif`;
        ctx.fillStyle = colorFor(l.kind);
        y += fs;
        ctx.fillText(l.text, textX, y, textAreaW);
        y += fs * 0.15;
      }

      if (!wide2D) {
        const bc1DH = Math.min(Math.round(innerH * 0.35), 50 * scale);
        ctx.drawImage(img, padding, h - padding - bc1DH, innerW, bc1DH);
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = barcodeDataUrl;
  });
}

/* ---------- Label preview component ---------- */

function LabelPreview({
  asset,
  widthPx,
  heightPx,
  barcodeDataUrl,
  barcodeType,
  fields,
  company,
}: {
  asset: Asset;
  widthPx: number;
  heightPx: number;
  barcodeDataUrl: string;
  barcodeType: BarcodeType;
  fields: ContentFields;
  company: Company | null | undefined;
}) {
  const companyAddress = formatCompanyAddress(company);
  const wide2D = is2D(barcodeType);
  const padding = Math.max(3, Math.round(Math.min(widthPx, heightPx) * 0.04));

  type LineKind = 'title' | 'number' | 'muted' | 'brand';
  const lines: { text: string; kind: LineKind }[] = [];
  if (fields.name) lines.push({ text: asset.name, kind: 'title' });
  if (fields.assetNumber) lines.push({ text: asset.assetNumber, kind: 'number' });
  if (fields.serialNumber && asset.serialNumber) lines.push({ text: `SN: ${asset.serialNumber}`, kind: 'muted' });
  if (fields.barcode && asset.barcode) lines.push({ text: `BC: ${asset.barcode}`, kind: 'muted' });
  if (fields.site && asset.site) lines.push({ text: asset.site.name, kind: 'muted' });
  if (fields.category && asset.category) lines.push({ text: asset.category.name, kind: 'muted' });
  if (fields.companyName && company?.legalName) lines.push({ text: company.tradingName || company.legalName, kind: 'brand' });
  if (fields.companyAddress && companyAddress) lines.push({ text: companyAddress, kind: 'muted' });
  if (fields.companyEmail && company?.primaryContactEmail) lines.push({ text: company.primaryContactEmail, kind: 'muted' });

  const innerW = widthPx - padding * 2;
  const innerH = heightPx - padding * 2;
  const gap = Math.max(2, Math.round(innerW * 0.015));

  // 2D layout: QR square on left, text on right.
  // QR is as large as possible (square, up to innerH) but shrinks
  // to guarantee a minimum readable font size for the text lines.
  const longestTitle = lines.filter(l => l.kind === 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const longestOther = lines.filter(l => l.kind !== 'title').reduce((m, l) => Math.max(m, l.text.length), 0);
  const minFont = 5;
  const minTextW = Math.max(longestTitle * 0.62 * minFont, longestOther * 0.58 * (minFont * 0.82));
  const bcIdeal = Math.min(innerH, innerW - minTextW - gap);
  const bcMin = Math.round(innerH * 0.3);
  const bcSize2D = Math.round(Math.max(bcMin, Math.min(innerH, bcIdeal)));
  const textAreaW2D = innerW - bcSize2D - gap;

  // 1D layout: text on top, barcode on bottom.
  const bc1DH = Math.min(Math.round(innerH * 0.35), 50);
  const textAreaH1D = innerH - bc1DH - 2;

  const textAreaH = wide2D ? innerH : textAreaH1D;
  const textAreaW = wide2D ? textAreaW2D : innerW;

  // Auto-fit font so each line fits on one visual row.
  const maxFontByTitleW = longestTitle > 0 ? textAreaW / (longestTitle * 0.62) : 99;
  const maxFontByOtherW = longestOther > 0 ? textAreaW / (longestOther * 0.58) : 99;
  const maxFontByW = Math.min(maxFontByTitleW, maxFontByOtherW / 0.82);

  const titleWeight = 1;
  const otherWeight = 0.82;
  const totalWeight = lines.reduce((s, l) => s + (l.kind === 'title' ? titleWeight : otherWeight), 0);
  const maxFontByH = totalWeight > 0 ? textAreaH / (totalWeight * 1.15) : 12;
  const fontSize = Math.max(3, Math.min(maxFontByH, maxFontByW, 14));
  const titleFont = fontSize;
  const otherFont = Math.max(3, Math.round(fontSize * otherWeight));

  const colorFor = (kind: LineKind): string => {
    switch (kind) {
      case 'title':  return '#2B3132';
      case 'number': return '#615AA0';
      case 'brand':  return '#2B3132';
      case 'muted':  return '#6b7280';
    }
  };
  const lineStyleFor = (kind: LineKind): CSSProperties => ({
    margin: 0,
    fontSize: kind === 'title' ? titleFont : otherFont,
    lineHeight: 1.15,
    fontWeight: kind === 'title' ? 700 : 400,
    fontFamily: 'Montserrat, sans-serif',
    color: colorFor(kind),
    whiteSpace: 'nowrap',
  });

  const TextLines = (
    <>
      {lines.map((l, i) => (
        <p key={i} style={lineStyleFor(l.kind)}>
          {l.text}
        </p>
      ))}
    </>
  );

  const wrapperStyle: CSSProperties = {
    width: widthPx,
    height: heightPx,
    padding,
    boxSizing: 'border-box',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    background: 'white',
    overflow: 'hidden',
    fontFamily: 'Montserrat, sans-serif',
  };

  return (
    <div style={wrapperStyle}>
      {wide2D ? (
        <div style={{ display: 'flex', gap, height: '100%', alignItems: 'center' }}>
          <img
            src={barcodeDataUrl}
            alt="barcode"
            style={{ width: bcSize2D, height: bcSize2D, flexShrink: 0 }}
          />
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            minWidth: 0, overflow: 'hidden', flex: 1,
          }}>
            {TextLines}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {TextLines}
          </div>
          <img
            src={barcodeDataUrl}
            alt="barcode"
            style={{
              width: innerW,
              height: bc1DH,
              alignSelf: 'center',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */

export function LabelsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('qrcode');
  const [sizePreset, setSizePreset] = useState<string>('avery-l7651');
  const [customW, setCustomW] = useState(50);
  const [customH, setCustomH] = useState(25);
  const [fields, setFields] = useState<ContentFields>(DEFAULT_FIELDS);
  const [barcodeUrls, setBarcodeUrls] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data } = useAssets({ search, pageSize: 50 });
  const assets = data?.assets ?? [];
  const { data: company } = useCompany();

  const selectedAssets = assets.filter(a => selected.has(a.id));

  const { widthPx, heightPx } = useMemo(() => {
    if (sizePreset === 'custom') {
      return { widthPx: customW * MM_TO_PX, heightPx: customH * MM_TO_PX };
    }
    const p = AVERY_PRESETS.find(x => x.value === sizePreset) ?? AVERY_PRESETS[0];
    return { widthPx: p.w * MM_TO_PX, heightPx: p.h * MM_TO_PX };
  }, [sizePreset, customW, customH]);

  // Regenerate barcodes whenever the type or selection changes.
  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const a of selectedAssets) {
        const cacheKey = `${a.id}::${barcodeType}`;
        if (barcodeUrls[cacheKey]) {
          urls[cacheKey] = barcodeUrls[cacheKey];
          continue;
        }
        try {
          const canvas = document.createElement('canvas');
          bwipjs.toCanvas(canvas, {
            bcid: barcodeType,
            text: barcodePayload(a, barcodeType),
            scale: 3,
            height: is2D(barcodeType) ? 10 : 8,
            includetext: !is2D(barcodeType),
            textxalign: 'center',
            paddingwidth: 2,
            paddingheight: 2,
          });
          urls[cacheKey] = canvas.toDataURL('image/png');
        } catch {
          // Render a placeholder if the payload isn't valid for the chosen symbology.
          const c = document.createElement('canvas');
          c.width = 200; c.height = 80;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#fee2e2';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.fillStyle = '#991b1b';
            ctx.font = '12px system-ui';
            ctx.fillText('Invalid payload', 40, 45);
          }
          urls[cacheKey] = c.toDataURL('image/png');
        }
      }
      if (!cancelled) setBarcodeUrls(prev => ({ ...prev, ...urls }));
    };
    if (selectedAssets.length > 0) generate();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, barcodeType, assets]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === assets.length) setSelected(new Set());
    else setSelected(new Set(assets.map(a => a.id)));
  };

  const saveLabelsToAssets = useCallback(async () => {
    const saves: Promise<void>[] = [];
    for (const a of selectedAssets) {
      const url = barcodeUrls[`${a.id}::${barcodeType}`];
      if (!url) continue;
      saves.push(
        renderLabelToDataUrl(a, url, barcodeType, fields, company, widthPx, heightPx)
          .then(dataUrl => api.patch(`/api/v1/assets/${a.id}`, { labelImage: dataUrl }))
          .then(() => {})
      );
    }
    await Promise.all(saves);
  }, [selectedAssets, barcodeUrls, barcodeType, fields, company, widthPx, heightPx]);

  const handlePrint = async () => {
    const printContent = printRef.current;
    if (!printContent) return;

    await saveLabelsToAssets();
    toast.success(`Labels saved to ${selectedAssets.length} asset(s)`);

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Asset Labels</title>
      <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700;800&display=swap');
        body { padding: 8mm; font-family: 'Montserrat', sans-serif; }
        * { font-family: 'Montserrat', sans-serif !important; }
        .label-grid { display: flex; flex-wrap: wrap; gap: 2mm; align-items: flex-start; }
        .label-grid > div { page-break-inside: avoid; break-inside: avoid; }
        .label-grid img { display: block; }
        @page { margin: 8mm; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="label-grid">${printContent.innerHTML}</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset Labels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate QR, 2D and 1D barcode labels for your assets
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowPreview(!showPreview)}>
              <QrCode size={14} className="mr-1" />
              {showPreview ? 'Hide' : 'Preview'} ({selected.size})
            </Button>
            <Button size="sm" variant="secondary" onClick={handlePrint}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
          </div>
        )}
      </div>

      {/* Asset selection */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold text-v-charcoal text-sm">Select Assets</span>
          <button onClick={selectAll} className="text-xs text-v-violet hover:underline">
            {selected.size === assets.length && assets.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search assets…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink" />
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {assets.map(a => (
              <label key={a.id} className="flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-gray-50 rounded">
                <div className={`size-5 rounded border-2 flex items-center justify-center transition-colors ${
                  selected.has(a.id) ? 'bg-v-violet border-v-violet' : 'border-gray-300'
                }`} onClick={() => toggleSelect(a.id)}>
                  {selected.has(a.id) && <Check size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-v-charcoal">{a.name}</p>
                  <p className="text-xs text-gray-400">
                    {a.assetNumber}
                    {a.serialNumber && ` · SN: ${a.serialNumber}`}
                    {a.site && ` · ${a.site.name}`}
                  </p>
                </div>
              </label>
            ))}
            {assets.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No assets found.</p>}
          </div>
        </CardBody>
      </Card>

      {/* Label design */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-v-charcoal text-sm">
            <Settings2 size={16} className="inline mr-2 text-v-violet" />
            Label Design
          </span>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Barcode standard */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-v-charcoal">Barcode standard</label>
            <select
              value={barcodeType}
              onChange={e => setBarcodeType(e.target.value as BarcodeType)}
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
            >
              <optgroup label="2D codes">
                {BARCODE_TYPES.filter(t => t.group === '2D').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="1D codes">
                {BARCODE_TYPES.filter(t => t.group === '1D').map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-gray-400">
              {is2D(barcodeType)
                ? 'Encodes the full asset identifier (id + number + name).'
                : 'Encodes barcode → serial → asset number. Numeric symbologies will pad/truncate.'}
            </p>
          </div>

          {/* Size preset */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-v-charcoal">Label size</label>
            <select
              value={sizePreset}
              onChange={e => setSizePreset(e.target.value)}
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
            >
              {AVERY_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {sizePreset === 'custom' && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number" min={5} max={300} value={customW}
                  onChange={e => setCustomW(Number(e.target.value) || 0)}
                  className="w-20 text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-v-pink"
                />
                <span className="text-xs text-gray-400">×</span>
                <input
                  type="number" min={5} max={300} value={customH}
                  onChange={e => setCustomH(Number(e.target.value) || 0)}
                  className="w-20 text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-v-pink"
                />
                <span className="text-xs text-gray-400">mm</span>
              </div>
            )}
          </div>

          {/* Content fields */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-v-charcoal">Show on label</label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {FIELD_LABELS.map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={fields[f.key]}
                    onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.checked }))}
                    className="accent-v-violet"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Label preview */}
      {showPreview && selectedAssets.length > 0 && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-v-charcoal text-sm">
              <QrCode size={16} className="inline mr-2 text-v-violet" />
              Label Preview — {selectedAssets.length} labels
            </span>
          </CardHeader>
          <CardBody>
            <div ref={printRef} className="flex flex-wrap gap-2">
              {selectedAssets.map(a => {
                const url = barcodeUrls[`${a.id}::${barcodeType}`];
                if (!url) return null;
                return (
                  <LabelPreview
                    key={a.id}
                    asset={a}
                    widthPx={widthPx}
                    heightPx={heightPx}
                    barcodeDataUrl={url}
                    barcodeType={barcodeType}
                    fields={fields}
                    company={company}
                  />
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
