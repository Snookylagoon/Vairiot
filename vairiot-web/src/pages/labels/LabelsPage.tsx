import { useMutation, useQueryClient } from '@tanstack/react-query';
import bwipjs from 'bwip-js/browser';
import {
  QrCode, Printer, Search, Check, Settings2, LayoutTemplate,
  Upload, Trash2, Save, X,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { assetDigitalLink, gs1128ElementString } from 'vairiot-shared';

import { CalibrateDialog } from './CalibrateDialog';
import { TemplateLayoutEditor } from './TemplateLayoutEditor';
import {
  BARCODE_TYPES, is2D, DEFAULT_FIELDS, FIELD_LABELS, MM_TO_PX, MIN_BARCODE_MM,
  computeLabelElements, renderLabelToDataUrl, rotateDataUrl, monochromeDataUrl,
  type BarcodeType, type ContentFields, type LayoutMap, type StyleMap,
  type ElementKey, type LabelDesign, type LabelLayoutInput,
} from './labelLayout';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { useAssets } from '@/hooks/useAssets';
import { useIdentification, type TenantIdentification } from '@/hooks/useIdentification';
import {
  useLabelTemplates, useSaveLabelTemplate, useDeleteLabelTemplate,
  useCompanyLogo, useUploadCompanyLogo, useDeleteCompanyLogo,
} from '@/hooks/useLabelTemplates';
import { useCompany } from '@/hooks/useOnboarding';
import { api } from '@/lib/api';
import type { Asset } from '@/types';


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

/* ---------- Barcode payload helper ---------- */

function barcodePayload(asset: Asset, type: BarcodeType, ident?: TenantIdentification | null): string {
  // GS1-identified assets encode a plain GS1 Digital Link URL in 2D codes —
  // readable by any phone camera — and a GS1-128 element string in code128.
  const iar = asset.individualAssetReference;
  if (iar && ident) {
    const mode = ident.mode === 'GS1' && asset.giai ? 'GS1' : 'INTERNAL';
    if (is2D(type)) {
      return assetDigitalLink(
        { mode, giai: asset.giai ?? null, iar, tenantSlug: ident.slug },
        ident.digitalLinkHost,
      );
    }
    if (type === 'code128') {
      return gs1128ElementString({ mode, giai: asset.giai ?? null, iar });
    }
  }
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

/* ---------- Label preview component ---------- */

function LabelPreview({
  input,
  barcodeDataUrl,
  logoDataUrl,
}: {
  input: LabelLayoutInput;
  barcodeDataUrl: string;
  logoDataUrl: string | null;
}) {
  const elements = computeLabelElements(input);
  return (
    <div style={{
      position: 'relative',
      width: input.widthPx,
      height: input.heightPx,
      boxSizing: 'border-box',
      border: '1px solid #d1d5db',
      borderRadius: 4,
      background: 'white',
      overflow: 'hidden',
      fontFamily: 'Montserrat, sans-serif',
    }}>
      {elements.map(el => {
        if (el.kind === 'barcode') {
          return (
            <img key={el.key} src={barcodeDataUrl} alt="barcode"
              style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }} />
          );
        }
        if (el.kind === 'logo') {
          if (!logoDataUrl) return null;
          return (
            <img key={el.key} src={logoDataUrl} alt="logo"
              style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, objectFit: 'contain' }} />
          );
        }
        return (
          <p key={el.key} style={{
            position: 'absolute',
            left: el.x,
            top: el.y,
            margin: 0,
            fontSize: el.font,
            lineHeight: 1.15,
            fontWeight: el.bold ? 700 : 400,
            fontStyle: el.italic ? 'italic' : 'normal',
            fontFamily: 'Montserrat, sans-serif',
            color: el.color,
            whiteSpace: 'nowrap',
          }}>
            {el.text}
          </p>
        );
      })}
    </div>
  );
}

/* ---------- Template config (persisted as JSON) ---------- */

type TemplateConfig = {
  barcodeType: BarcodeType;
  sizePreset: string;
  customW: number;
  customH: number;
  fields: ContentFields;
  logoScale: number;
  barcodeMm: number | null;
  layout: LayoutMap | null;
  styles: StyleMap;
  groups: ElementKey[][];
  printMode: 'sheet' | 'roll';
  printRotation: 0 | 90 | 180 | 270;
  monochrome: boolean;
  leaderLabel: boolean;
  /** Roll mode: shifts artwork down the label (mm, may be negative/fractional) for sub-mm registration the printer driver can't do. */
  printOffsetMm?: number;
  /** Roll mode, continuous/fixed-feed media: gap between labels (mm). Page height becomes label + gap so each label advances exactly one pitch. 0 = gap-sensing mode (page = label). */
  printGapMm?: number;
  /** Legacy field from before rotation had a direction (true ≙ 90). */
  printRotate?: boolean;
  /** Print settings tuned for a specific printer. They travel with the
   *  template so mobile devices reproduce the same setup: the device matches
   *  its saved/paired printer by name and prints `copies` of each label. */
  printer?: { name?: string; copies?: number };
};

/* ---------- Page ---------- */

export function LabelsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('qrcode');
  const [sizePreset, setSizePreset] = useState<string>('avery-l7651');
  const [customW, setCustomW] = useState(50);
  const [customH, setCustomH] = useState(25);
  const [fields, setFields] = useState<ContentFields>(DEFAULT_FIELDS);
  const [logoScale, setLogoScale] = useState(0.3);
  const [barcodeMm, setBarcodeMm] = useState<number | null>(null);
  const [layout, setLayout] = useState<LayoutMap | null>(null);
  const [styles, setStyles] = useState<StyleMap>({});
  const [groups, setGroups] = useState<ElementKey[][]>([]);
  const [barcodeUrls, setBarcodeUrls] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [printMode, setPrintMode] = useState<'sheet' | 'roll'>('sheet');
  const [printRotation, setPrintRotation] = useState<0 | 90 | 180 | 270>(0);
  const [monochrome, setMonochrome] = useState(false);
  const [leaderLabel, setLeaderLabel] = useState(false);
  const [printOffsetMm, setPrintOffsetMm] = useState(0);
  const [printGapMm, setPrintGapMm] = useState(0);
  const [printerName, setPrinterName] = useState('');
  const [printCopies, setPrintCopies] = useState(1);
  const [showCalibrate, setShowCalibrate] = useState(false);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const { data } = useAssets({ search, pageSize: 50 });
  const assets = data?.assets ?? [];
  const { data: company } = useCompany();
  const { data: ident } = useIdentification();
  const { data: logo } = useCompanyLogo();
  const uploadLogo = useUploadCompanyLogo();
  const deleteLogo = useDeleteCompanyLogo();
  const { data: templates = [] } = useLabelTemplates();
  const saveTemplate = useSaveLabelTemplate();
  const deleteTemplate = useDeleteLabelTemplate();

  const selectedAssets = assets.filter(a => selected.has(a.id));
  // Sample asset the layout editor works on — click a preview label to change it.
  const sampleAsset = assets.find(a => a.id === sampleId) ?? selectedAssets[0] ?? assets[0] ?? null;

  // Assets created before GS1 identification have no IAR — offer a backfill.
  const qc = useQueryClient();
  const missingIarCount = assets.filter(a => !a.individualAssetReference).length;
  const backfillIars = useMutation({
    mutationFn: () => api.post('/api/v1/identifiers/backfill').then(r => r.data),
    onSuccess: (data: { updated: number }) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      setBarcodeUrls({}); // payloads changed — regenerate every barcode
      toast.success(`Identifiers assigned to ${data.updated} asset(s)`);
    },
    onError: () => toast.error('Failed to assign identifiers'),
  });

  const { widthPx, heightPx, widthMm, heightMm } = useMemo(() => {
    if (sizePreset === 'custom') {
      return { widthPx: customW * MM_TO_PX, heightPx: customH * MM_TO_PX, widthMm: customW, heightMm: customH };
    }
    const p = AVERY_PRESETS.find(x => x.value === sizePreset) ?? AVERY_PRESETS[0];
    return { widthPx: p.w * MM_TO_PX, heightPx: p.h * MM_TO_PX, widthMm: p.w, heightMm: p.h };
  }, [sizePreset, customW, customH]);

  // Slider bounds for a fixed 2D symbol size: 12 mm up to the label's short edge.
  const maxBarcodeMm = Math.max(MIN_BARCODE_MM, Math.floor(Math.min(widthMm, heightMm)));

  const logoAspect = logo ? logo.width / logo.height : null;
  const rawLogoUrl = logo?.dataUrl ?? null;

  // Black & white mode: convert the logo to solid-black artwork once.
  const [monoLogoUrl, setMonoLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (monochrome && rawLogoUrl) {
      monochromeDataUrl(rawLogoUrl)
        .then(u => { if (!cancelled) setMonoLogoUrl(u); })
        .catch(() => { if (!cancelled) setMonoLogoUrl(null); });
    } else {
      setMonoLogoUrl(null);
    }
    return () => { cancelled = true; };
  }, [monochrome, rawLogoUrl]);

  // What every renderer (preview, editor, canvas/print) actually uses.
  const logoDataUrl = monochrome ? monoLogoUrl : rawLogoUrl;

  const design: LabelDesign = useMemo(
    () => ({ barcodeType, fields, logoScale, barcodeMm, layout, styles, monochrome }),
    [barcodeType, fields, logoScale, barcodeMm, layout, styles, monochrome],
  );

  // The HRI mark: the licensed GS1 Company Prefix once active, otherwise the
  // per-tenant Vairiot mark that stands in for it.
  const hriMark = ident?.activePrefix?.prefix ?? ident?.tenantMark ?? null;

  const layoutInputFor = useCallback((asset: Asset): LabelLayoutInput => ({
    asset, company, design, widthPx, heightPx, logoAspect,
    tenantMark: hriMark,
  }), [company, design, widthPx, heightPx, logoAspect, hriMark]);

  // Assets whose barcodes we need rendered (selection + editor sample).
  const assetsNeedingBarcodes = useMemo(() => {
    const list = [...selectedAssets];
    if (showLayoutEditor && sampleAsset && !list.some(a => a.id === sampleAsset.id)) {
      list.push(sampleAsset);
    }
    return list;
    // IAR is part of the key so barcodes regenerate after an identifier backfill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedAssets.map(a => `${a.id}:${a.individualAssetReference ?? ''}`).join(','),
    showLayoutEditor, sampleAsset?.id, sampleAsset?.individualAssetReference,
  ]);

  // Regenerate barcodes whenever the type or selection changes.
  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const a of assetsNeedingBarcodes) {
        const cacheKey = `${a.id}::${barcodeType}`;
        if (barcodeUrls[cacheKey]) {
          urls[cacheKey] = barcodeUrls[cacheKey];
          continue;
        }
        try {
          const canvas = document.createElement('canvas');
          bwipjs.toCanvas(canvas, {
            bcid: barcodeType,
            text: barcodePayload(a, barcodeType, ident),
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
    if (assetsNeedingBarcodes.length > 0) generate();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsNeedingBarcodes, barcodeType, ident?.mode]);

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

  /* ---------- Templates ---------- */

  const currentConfig = (): TemplateConfig => ({
    barcodeType, sizePreset, customW, customH, fields, logoScale, barcodeMm, layout, styles, groups, printMode, printRotation, monochrome, leaderLabel, printOffsetMm, printGapMm,
    printer: { name: printerName.trim(), copies: printCopies },
  });

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const c = t.config as Partial<TemplateConfig>;
    if (c.barcodeType && BARCODE_TYPES.some(b => b.value === c.barcodeType)) setBarcodeType(c.barcodeType);
    if (c.sizePreset) setSizePreset(c.sizePreset);
    if (typeof c.customW === 'number') setCustomW(c.customW);
    if (typeof c.customH === 'number') setCustomH(c.customH);
    if (c.fields) setFields({ ...DEFAULT_FIELDS, ...c.fields });
    if (typeof c.logoScale === 'number') setLogoScale(c.logoScale);
    setBarcodeMm(typeof c.barcodeMm === 'number' ? c.barcodeMm : null);
    setLayout(c.layout ?? null);
    setStyles(c.styles ?? {});
    setGroups(c.groups ?? []);
    if (c.printMode === 'sheet' || c.printMode === 'roll') setPrintMode(c.printMode);
    if (c.printRotation === 0 || c.printRotation === 90 || c.printRotation === 180 || c.printRotation === 270) {
      setPrintRotation(c.printRotation);
    } else if (typeof c.printRotate === 'boolean') {
      setPrintRotation(c.printRotate ? 90 : 0);
    }
    setMonochrome(c.monochrome === true);
    setLeaderLabel(c.leaderLabel === true);
    setPrintOffsetMm(typeof c.printOffsetMm === 'number' ? c.printOffsetMm : 0);
    setPrintGapMm(typeof c.printGapMm === 'number' ? c.printGapMm : 0);
    setPrinterName(typeof c.printer?.name === 'string' ? c.printer.name : '');
    setPrintCopies(
      typeof c.printer?.copies === 'number' && c.printer.copies >= 1
        ? Math.min(20, Math.round(c.printer.copies))
        : 1,
    );
    setTemplateName(t.name);
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) {
      toast.error('Give the template a name first');
      return;
    }
    saveTemplate.mutate({ name, config: currentConfig() }, {
      onSuccess: (t) => setSelectedTemplateId(t.id),
    });
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    deleteTemplate.mutate(selectedTemplateId, {
      onSuccess: () => {
        setSelectedTemplateId('');
        setTemplateName('');
      },
    });
  };

  /* ---------- Logo upload ---------- */

  const onLogoFileChange = (file: File | undefined) => {
    if (!file) return;
    uploadLogo.mutate(file);
    if (logoFileRef.current) logoFileRef.current.value = '';
  };

  /* ---------- Print / save ---------- */

  // Render every selected label to a PNG at the exact label size.
  const renderSelectedLabels = useCallback(async (options?: { scale?: number; threshold?: boolean }) => {
    const rendered: { asset: Asset; dataUrl: string }[] = [];
    for (const a of selectedAssets) {
      const url = barcodeUrls[`${a.id}::${barcodeType}`];
      if (!url) continue;
      rendered.push({ asset: a, dataUrl: await renderLabelToDataUrl(layoutInputFor(a), url, logoDataUrl, options) });
    }
    return rendered;
  }, [selectedAssets, barcodeUrls, barcodeType, layoutInputFor, logoDataUrl]);

  const handlePrint = async () => {
    // Standard-resolution copies stored on the assets.
    const rendered = await renderSelectedLabels();
    if (rendered.length === 0) return;

    await Promise.all(rendered.map(r =>
      api.patch(`/api/v1/assets/${r.asset.id}`, { labelImage: r.dataUrl }).then(() => {})));
    toast.success(`Labels saved to ${rendered.length} asset(s)`);

    // Print copies: higher resolution so the thermal head doesn't magnify the
    // raster grid, and (in B&W mode) hard 1-bit thresholding for crisp text.
    const printRendered = await renderSelectedLabels({ scale: 6, threshold: monochrome });

    // Roll media whose orientation doesn't match the page: rotate the artwork,
    // and for quarter turns swap the page dims to match the feed.
    const rotate = printMode === 'roll' && printRotation !== 0;
    const quarterTurn = rotate && printRotation !== 180;
    const pageW = quarterTurn ? heightMm : widthMm;
    const pageH = quarterTurn ? widthMm : heightMm;
    let printUrls: (string | null)[] = rotate
      ? await Promise.all(printRendered.map(r => rotateDataUrl(r.dataUrl, printRotation as 90 | 180 | 270)))
      : printRendered.map(r => r.dataUrl);
    // Copies per label (saved with the template's printer settings).
    if (printCopies > 1) printUrls = printUrls.flatMap(u => Array(printCopies).fill(u) as (string | null)[]);
    // Optional blank leader page: the printer spends its first-feed
    // registration drift on an empty label instead of a real one.
    if (printMode === 'roll' && leaderLabel) printUrls.unshift(null);

    const win = window.open('', '_blank');
    if (!win) return;

    // Print the rendered PNGs at their exact physical size so labels land on
    // the media, not between labels.
    const imgs = printUrls
      .map(u => u ? `<div class="label"><img src="${u}" alt=""></div>` : '<div class="label"></div>')
      .join('');

    // Continuous / fixed-feed media (gap sensor unusable, e.g. RFID inlay
    // stock): the page spans the full pitch (label + gap) so every label
    // advances exactly one pitch by dead reckoning; the gap prints blank.
    const feedH = pageH + (printGapMm > 0 ? printGapMm : 0);
    const style = printMode === 'roll'
      // Roll / thermal (e.g. TSC 210): page = label (or full pitch), zero margin, one per page.
      ? `
        @page { size: ${pageW}mm ${feedH}mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        .label { width: ${pageW}mm; height: ${feedH}mm; overflow: hidden; page-break-after: always; break-after: page; }
        .label img { width: ${pageW}mm; height: ${pageH}mm; display: block; margin-top: ${printOffsetMm}mm; }`
      // Sheet (A4 / Avery): flow labels in a grid with small gaps.
      : `
        @page { margin: 8mm; }
        html, body { margin: 0; padding: 0; }
        body { display: flex; flex-wrap: wrap; gap: 2mm; align-content: flex-start; }
        .label { width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
        .label img { width: ${widthMm}mm; height: ${heightMm}mm; display: block; }`;

    // Screen-only reminder (never printed): the print dialog must be set to
    // the matching custom paper size or the driver scales/rotates the job.
    const note = printMode === 'roll'
      ? `<div class="print-note"><strong>Before printing:</strong> in the print dialog set
          <strong>Paper Size</strong> to your custom <strong>${pageW} × ${feedH} mm</strong> size
          — not Default/A4 — and keep <strong>Scaling at 100%</strong>.
          ${printGapMm > 0
            ? `This template uses continuous (fixed-feed) mode: the paper size must span the full
               ${pageW} × ${feedH} mm pitch (label + ${printGapMm} mm gap), and the printer driver's
               Media Setting → Type must be <strong>Continuous</strong> with all offsets 0.`
            : 'Wrong paper size makes labels print rotated or between labels.'}</div>`
      : `<div class="print-note"><strong>Before printing:</strong> in the print dialog set
          <strong>Paper Size</strong> to your sheet size (e.g. A4) and keep
          <strong>Scaling at 100%</strong> so label dimensions stay exact.</div>`;

    win.document.write(`
      <html><head><title>Asset Labels</title>
      <style>* { box-sizing: border-box; }${style}
        .print-note { font: 13px/1.5 -apple-system, system-ui, sans-serif; background: #FEF3C7;
          color: #92400E; border: 1px solid #F59E0B; border-radius: 6px; padding: 10px 14px; margin: 8px; }
        @media print { .print-note { display: none; } }
      </style>
      </head><body>${note}${imgs}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  const sampleBarcodeUrl = sampleAsset ? barcodeUrls[`${sampleAsset.id}::${barcodeType}`] ?? null : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset Labels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate QR, 2D and 1D barcode labels for your assets
          </p>
        </div>
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
          {missingIarCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-800">
                {missingIarCount} asset{missingIarCount === 1 ? ' has' : 's have'} no Vairiot/GS1
                identifier yet — their labels fall back to the legacy barcode payload.
              </p>
              <Button size="sm" variant="secondary"
                onClick={() => backfillIars.mutate()} disabled={backfillIars.isPending}>
                {backfillIars.isPending ? 'Assigning…' : 'Assign identifiers'}
              </Button>
            </div>
          )}
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
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold text-v-charcoal text-sm">
            <Settings2 size={16} className="inline mr-2 text-v-violet" />
            Label Design
          </span>
          {/* Template picker + save */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={e => applyTemplate(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink max-w-44"
            >
              <option value="">Template: none</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Template name…"
              className="w-36 text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-v-pink"
            />
            <Button size="sm" variant="secondary" onClick={handleSaveTemplate} disabled={saveTemplate.isPending}>
              <Save size={13} className="mr-1" /> Save
            </Button>
            {selectedTemplateId && (
              <button onClick={handleDeleteTemplate} title="Delete template"
                className="text-gray-400 hover:text-red-500 p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </div>

          {/* Company logo upload + size, barcode size */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="block text-xs font-medium text-v-charcoal">Company logo</label>
            {rawLogoUrl ? (
              <img src={(monochrome && monoLogoUrl) || rawLogoUrl} alt="Company logo"
                className="h-10 max-w-32 object-contain border border-gray-200 rounded bg-white p-0.5" />
            ) : (
              <span className="text-xs text-gray-400">No logo uploaded</span>
            )}
            <input
              ref={logoFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => onLogoFileChange(e.target.files?.[0])}
            />
            <Button size="sm" variant="secondary"
              onClick={() => logoFileRef.current?.click()}
              disabled={uploadLogo.isPending}>
              <Upload size={13} className="mr-1" />
              {rawLogoUrl ? 'Replace' : 'Upload'}
            </Button>
            {rawLogoUrl && (
              <button onClick={() => deleteLogo.mutate()} title="Remove logo"
                className="text-gray-400 hover:text-red-500 p-1">
                <X size={14} />
              </button>
            )}
            {fields.companyLogo && rawLogoUrl && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Size</span>
                <input
                  type="range" min={10} max={70} step={5}
                  value={Math.round(logoScale * 100)}
                  onChange={e => setLogoScale(Number(e.target.value) / 100)}
                  className="w-32 accent-v-violet"
                />
                <span className="text-xs text-gray-400 w-9">{Math.round(logoScale * 100)}%</span>
              </div>
            )}
            {fields.companyLogo && !rawLogoUrl && (
              <span className="text-[11px] text-amber-600">
                “Company logo” is ticked but no logo is uploaded yet.
              </span>
            )}
          </div>

          {/* Colour mode */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="block text-xs font-medium text-v-charcoal">Print colour</label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
              <input
                type="checkbox"
                checked={monochrome}
                onChange={e => setMonochrome(e.target.checked)}
                className="accent-v-violet"
              />
              Black &amp; white — forces text and logo to solid black (recommended for thermal printers)
            </label>
          </div>

          {/* Fixed 2D symbol size (auto when untouched) */}
          {is2D(barcodeType) && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="block text-xs font-medium text-v-charcoal">QR code size</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Size</span>
                <input
                  type="range" min={MIN_BARCODE_MM} max={maxBarcodeMm} step={1}
                  value={barcodeMm ?? maxBarcodeMm}
                  onChange={e => setBarcodeMm(Number(e.target.value))}
                  className="w-32 accent-v-violet"
                />
                <span className="text-xs text-gray-400 w-12">
                  {barcodeMm != null ? `${barcodeMm} mm` : 'Auto'}
                </span>
                {barcodeMm != null && (
                  <button onClick={() => setBarcodeMm(null)}
                    className="text-[11px] text-gray-400 hover:text-v-violet underline">
                    Reset to auto
                  </button>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Preview / print controls */}
          <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center gap-2">
            <label className="block text-xs font-medium text-v-charcoal mr-2">Print</label>
            <Button size="sm" onClick={() => setShowPreview(!showPreview)} disabled={selected.size === 0}>
              <QrCode size={14} className="mr-1" />
              {showPreview ? 'Hide' : 'Preview'} ({selected.size})
            </Button>
            <select
              value={printMode}
              onChange={e => setPrintMode(e.target.value as 'sheet' | 'roll')}
              title="Print format"
              className="text-xs rounded-lg border border-gray-200 px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
            >
              <option value="sheet">Sheet (A4 / Avery)</option>
              <option value="roll">Roll (thermal printer)</option>
            </select>
            {printMode === 'roll' && (
              <select
                value={printRotation}
                onChange={e => setPrintRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}
                title="Rotate the artwork to match how the printer feeds the label — pick whichever prints upright"
                className="text-xs rounded-lg border border-gray-200 px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
              >
                <option value={0}>No rotation</option>
                <option value={90}>Rotate 90° ↻</option>
                <option value={180}>Rotate 180°</option>
                <option value={270}>Rotate 90° ↺</option>
              </select>
            )}
            {printMode === 'roll' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"
                title="Prepends an empty label so the printer's first-feed registration drift lands on a blank, not a real label">
                <input
                  type="checkbox"
                  checked={leaderLabel}
                  onChange={e => setLeaderLabel(e.target.checked)}
                  className="accent-v-violet"
                />
                Blank first label
              </label>
            )}
            {printMode === 'roll' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600"
                title="Shifts the artwork down the label (negative = up). Use for sub-millimetre registration steps the printer driver doesn't offer — e.g. driver offset −5 mm plus 0.5 here for an effective −5.5 mm.">
                Nudge ↓
                <input
                  type="number"
                  step={0.1}
                  min={-10}
                  max={10}
                  value={printOffsetMm}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setPrintOffsetMm(Number.isFinite(v) ? Math.max(-10, Math.min(10, v)) : 0);
                  }}
                  className="w-16 text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
                />
                mm
              </label>
            )}
            {printMode === 'roll' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600"
                title="Continuous / fixed-feed mode for media the gap sensor can't read (e.g. RFID labels): enter the gap between labels and each page spans the full pitch. Requires the printer driver's Media Setting → Type = Continuous and a paper size of label + gap. Leave at 0 for normal gap-sensing stock.">
                Gap
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={20}
                  value={printGapMm}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setPrintGapMm(Number.isFinite(v) ? Math.max(0, Math.min(20, v)) : 0);
                  }}
                  className="w-16 text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
                />
                mm
              </label>
            )}
            {printMode === 'roll' && (
              <Button size="sm" variant="secondary" onClick={() => setShowCalibrate(true)}
                title="Run this after every roll change: recalibrates the printer to this label size and gap, and verifies a label stops at the tear line">
                <Settings2 size={14} className="mr-1" /> Calibrate
              </Button>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-600"
              title="Which printer these settings are tuned for. Saved with the template — mobile devices match their paired printer by this name and reuse the template's print setup.">
              Printer
              <input
                value={printerName}
                onChange={e => setPrinterName(e.target.value)}
                placeholder="e.g. TSC TE210"
                className="w-28 text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600"
              title="Copies of each label to print. Saved with the template's printer settings.">
              Copies
              <input
                type="number"
                min={1}
                max={20}
                value={printCopies}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setPrintCopies(Number.isFinite(v) ? Math.max(1, Math.min(20, v)) : 1);
                }}
                className="w-14 text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
              />
            </label>
            <Button size="sm" variant="secondary" onClick={handlePrint} disabled={selected.size === 0}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
            {selected.size === 0 && (
              <span className="text-[11px] text-gray-400">Select assets above to preview or print.</span>
            )}
          </div>

          {/* Layout editor toggle */}
          <div className="border-t border-gray-100 pt-4 flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => setShowLayoutEditor(v => !v)}>
              <LayoutTemplate size={13} className="mr-1" />
              {showLayoutEditor ? 'Close layout editor' : 'Edit layout'}
            </Button>
            {(layout || Object.keys(styles).length > 0) && (
              <>
                <span className="text-[11px] text-v-violet font-medium">Custom layout active</span>
                <button
                  onClick={() => { setLayout(null); setStyles({}); setGroups([]); }}
                  className="text-[11px] text-gray-400 hover:text-red-500 underline">
                  Reset to automatic layout
                </button>
              </>
            )}
          </div>

          {/* Freeform layout editor */}
          {showLayoutEditor && (
            sampleAsset && sampleBarcodeUrl ? (
              <TemplateLayoutEditor
                input={{ ...layoutInputFor(sampleAsset), placeholders: true }}
                barcodeDataUrl={sampleBarcodeUrl}
                logoDataUrl={logoDataUrl}
                groups={groups}
                onLayoutChange={setLayout}
                onStylesChange={setStyles}
                onGroupsChange={setGroups}
              />
            ) : (
              <p className="text-xs text-gray-400">
                {sampleAsset ? 'Generating sample barcode…' : 'Add at least one asset to design the layout.'}
              </p>
            )
          )}
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
            <div className="flex flex-wrap gap-2">
              {selectedAssets.map(a => {
                const url = barcodeUrls[`${a.id}::${barcodeType}`];
                if (!url) return null;
                const isSample = sampleAsset?.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    title={showLayoutEditor
                      ? (isSample ? 'Shown in the layout editor' : 'Click to edit layout with this asset')
                      : a.name}
                    onClick={() => { setSampleId(a.id); if (!showLayoutEditor) setShowLayoutEditor(true); }}
                    className={`rounded transition-shadow cursor-pointer text-left ${
                      isSample && showLayoutEditor ? 'ring-2 ring-v-violet ring-offset-1' : 'hover:ring-2 hover:ring-v-pink/50'
                    }`}
                  >
                    <LabelPreview
                      input={layoutInputFor(a)}
                      barcodeDataUrl={url}
                      logoDataUrl={logoDataUrl}
                    />
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Click a label to open it in the layout editor.
            </p>
          </CardBody>
        </Card>
      )}

      <CalibrateDialog
        open={showCalibrate}
        widthMm={widthMm}
        heightMm={heightMm}
        onClose={() => setShowCalibrate(false)}
      />
    </div>
  );
}
