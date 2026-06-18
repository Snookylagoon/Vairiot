import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useImportAssets } from '@/hooks/useImport';
import type { ImportResult } from '@/types';

const ASSET_FIELDS = [
  { key: 'name', label: 'Asset Name', required: true },
  { key: 'description', label: 'Description' },
  { key: 'categoryName', label: 'Category' },
  { key: 'siteName', label: 'Site' },
  { key: 'serialNumber', label: 'Serial Number' },
  { key: 'modelNumber', label: 'Model Number' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'rfidTag', label: 'RFID Tag' },
  { key: 'purchaseCost', label: 'Purchase Cost' },
  { key: 'purchaseDate', label: 'Purchase Date' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'warrantyExpiry', label: 'Warranty Expiry' },
  { key: 'condition', label: 'Condition' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
  { key: 'purchaseOrderNumber', label: 'PO Number' },
  { key: 'invoiceNumber', label: 'Invoice Number' },
  { key: 'residualValue', label: 'Residual Value' },
  { key: 'usefulLifeMonths', label: 'Useful Life (Months)' },
  { key: 'depreciationMethod', label: 'Depreciation Method' },
  { key: 'depreciationStartDate', label: 'Depreciation Start Date' },
] as const;

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(current.trim()); current = ''; }
        else current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cells = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });

  return { headers, rows };
}

function autoMapColumns(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const csvH of csvHeaders) {
    const n = normalize(csvH);
    for (const field of ASSET_FIELDS) {
      if (normalize(field.label) === n || normalize(field.key) === n) {
        mapping[csvH] = field.key;
        break;
      }
    }
  }
  return mapping;
}

type Step = 'upload' | 'map' | 'preview' | 'result';

export function ImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const importAssets = useImportAssets();

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0 || rows.length === 0) return;
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMapColumns(headers));
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const mappedRows = csvRows.map(row => {
    const mapped: Record<string, string> = {};
    for (const [csvCol, fieldKey] of Object.entries(mapping)) {
      if (fieldKey && row[csvCol]) mapped[fieldKey] = row[csvCol];
    }
    return mapped;
  }).filter(r => r.name);

  const handleImport = async () => {
    const res = await importAssets.mutateAsync({ rows: mappedRows });
    setResult(res);
    setStep('result');
  };

  const reset = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Import Assets</h1>
        <p className="text-sm text-gray-500 mt-1">Bulk import assets from a CSV file</p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(['upload', 'map', 'preview', 'result'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight size={12} className="text-gray-300" />}
            <span className={`px-3 py-1.5 rounded-full ${step === s ? 'bg-v-violet text-white' : 'bg-gray-100 text-gray-500'}`}>
              {s === 'upload' ? '1. Upload' : s === 'map' ? '2. Map Columns' : s === 'preview' ? '3. Preview' : '4. Result'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardBody>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center hover:border-v-pink transition-colors"
            >
              <Upload size={40} className="mx-auto text-gray-300 mb-4" />
              <p className="text-sm text-gray-500 mb-4">Drag and drop a CSV file here, or click to browse</p>
              <label className="cursor-pointer">
                <input type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-v-charcoal bg-white hover:bg-gray-50 transition-colors">Choose File</span>
              </label>
              <p className="text-xs text-gray-400 mt-4">
                CSV must include a header row. The first column should contain the asset name.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'map' && (
        <Card>
          <CardHeader>
            <span className="font-semibold text-v-charcoal text-sm">Map CSV Columns to Asset Fields</span>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-gray-400">We auto-matched some columns. Adjust any that are wrong or unmapped.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {csvHeaders.map(h => (
                <div key={h} className="flex items-center gap-3">
                  <span className="text-sm text-v-charcoal font-mono bg-gray-50 px-2 py-1 rounded min-w-[120px] truncate">{h}</span>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    value={mapping[h] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                    className="flex-1 text-sm rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-v-pink bg-white"
                  >
                    <option value="">— Skip column —</option>
                    {ASSET_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>{f.label}{'required' in f && f.required ? ' *' : ''}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep('preview')}
                disabled={!Object.values(mapping).includes('name')}>
                Preview Import <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="font-semibold text-v-charcoal text-sm">
              <FileSpreadsheet size={16} className="inline mr-2 text-v-violet" />
              Preview — {mappedRows.length} rows ready to import
            </span>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-400">#</th>
                    {ASSET_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                      <th key={f.key} className="text-left py-2 px-2 text-xs font-medium text-gray-400">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                      {ASSET_FIELDS.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                        <td key={f.key} className="py-1.5 px-2 text-v-charcoal truncate max-w-[200px]">{row[f.key] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedRows.length > 10 && (
                <p className="text-xs text-gray-400 mt-2">Showing first 10 of {mappedRows.length} rows</p>
              )}
            </div>
            {csvRows.length - mappedRows.length > 0 && (
              <p className="text-xs text-amber-600">
                <AlertTriangle size={12} className="inline mr-1" />
                {csvRows.length - mappedRows.length} rows will be skipped (missing name)
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={() => setStep('map')}>
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
              <Button size="sm" onClick={handleImport} loading={importAssets.isPending}>
                Import {mappedRows.length} Assets
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 'result' && result && (
        <Card>
          <CardBody className="py-8 text-center space-y-4">
            <CheckCircle size={48} className="mx-auto text-emerald-500" />
            <h2 className="text-xl font-bold text-v-charcoal">Import Complete</h2>
            <div className="flex items-center justify-center gap-6 text-sm">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{result.created}</p>
                <p className="text-gray-500">Created</p>
              </div>
              {result.skipped > 0 && (
                <div>
                  <p className="text-2xl font-bold text-amber-500">{result.skipped}</p>
                  <p className="text-gray-500">Skipped</p>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="max-w-md mx-auto text-left">
                <p className="text-sm font-medium text-gray-600 mb-2">Errors:</p>
                <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-red-500">Row {err.row}: {err.message}</p>
                  ))}
                </div>
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={reset}>Import More</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
