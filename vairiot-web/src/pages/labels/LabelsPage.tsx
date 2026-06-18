import { useState, useEffect, useRef } from 'react';
import { QrCode, Printer, Search, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAssets } from '@/hooks/useAssets';
import type { Asset } from '@/types';

type LabelSize = 'small' | 'medium' | 'large';

const LABEL_SIZES: Record<LabelSize, { w: number; h: number; qr: number; label: string }> = {
  small:  { w: 200, h: 100, qr: 70,  label: 'Small (50×25mm)' },
  medium: { w: 280, h: 140, qr: 100, label: 'Medium (70×35mm)' },
  large:  { w: 380, h: 180, qr: 140, label: 'Large (95×45mm)' },
};

function QRLabel({ asset, size, qrDataUrl }: { asset: Asset; size: LabelSize; qrDataUrl: string }) {
  const s = LABEL_SIZES[size];
  return (
    <div className="inline-block border border-gray-200 rounded bg-white" style={{ width: s.w, height: s.h, padding: 8 }}>
      <div className="flex gap-2 h-full">
        <img src={qrDataUrl} alt="QR" style={{ width: s.qr, height: s.qr }} className="shrink-0" />
        <div className="flex flex-col justify-center min-w-0 overflow-hidden">
          <p className="font-bold text-[10px] text-v-charcoal truncate">{asset.name}</p>
          <p className="font-mono text-[9px] text-v-violet">{asset.assetNumber}</p>
          {asset.serialNumber && <p className="text-[8px] text-gray-400 truncate">SN: {asset.serialNumber}</p>}
          {asset.barcode && <p className="text-[8px] text-gray-400 truncate">BC: {asset.barcode}</p>}
          {asset.site && <p className="text-[8px] text-gray-400 truncate">{asset.site.name}</p>}
        </div>
      </div>
    </div>
  );
}

export function LabelsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelSize, setLabelSize] = useState<LabelSize>('medium');
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data } = useAssets({ search, pageSize: 50 });
  const assets = data?.assets ?? [];

  const selectedAssets = assets.filter(a => selected.has(a.id));

  useEffect(() => {
    const generate = async () => {
      const urls: Record<string, string> = {};
      for (const a of selectedAssets) {
        if (!qrUrls[a.id]) {
          const qrData = JSON.stringify({ id: a.id, assetNumber: a.assetNumber, name: a.name });
          urls[a.id] = await QRCode.toDataURL(qrData, { width: 200, margin: 1, color: { dark: '#2B3132' } });
        }
      }
      if (Object.keys(urls).length > 0) setQrUrls(prev => ({ ...prev, ...urls }));
    };
    if (selectedAssets.length > 0) generate();
  }, [selected, assets]);

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

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Asset Labels</title>
      <style>
        body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
        .label-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .label { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; display: inline-flex; gap: 8px; align-items: center; page-break-inside: avoid; }
        .label img { flex-shrink: 0; }
        .label-text { overflow: hidden; }
        .label-text p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .name { font-weight: bold; font-size: 10px; }
        .number { font-family: monospace; font-size: 9px; color: #615AA0; }
        .detail { font-size: 8px; color: #9ca3af; }
        @media print { body { padding: 0; } .label { border: 1px solid #000; } }
      </style></head><body>
      <div class="label-grid">${printContent.innerHTML}</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset Labels</h1>
          <p className="text-sm text-gray-500 mt-1">Generate QR code labels for your assets</p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <select value={labelSize} onChange={e => setLabelSize(e.target.value as LabelSize)}
              className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink bg-white">
              {Object.entries(LABEL_SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => setShowPreview(!showPreview)}>
              <QrCode size={14} className="mr-1" /> {showPreview ? 'Hide' : 'Preview'} ({selected.size})
            </Button>
            <Button size="sm" variant="secondary" onClick={handlePrint}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
          </div>
        )}
      </div>

      {/* Search & Select */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="font-semibold text-v-charcoal text-sm">Select Assets</span>
          <button onClick={selectAll} className="text-xs text-v-violet hover:underline">
            {selected.size === assets.length ? 'Deselect All' : 'Select All'}
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

      {/* Label Preview */}
      {showPreview && selectedAssets.length > 0 && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-v-charcoal text-sm">
              <QrCode size={16} className="inline mr-2 text-v-violet" />
              Label Preview — {selectedAssets.length} labels
            </span>
          </CardHeader>
          <CardBody>
            <div ref={printRef} className="flex flex-wrap gap-3">
              {selectedAssets.map(a => (
                qrUrls[a.id] ? (
                  <QRLabel key={a.id} asset={a} size={labelSize} qrDataUrl={qrUrls[a.id]} />
                ) : null
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
