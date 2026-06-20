import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, File, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type ExportFormat = 'csv' | 'xlsx' | 'docx' | 'pdf';

interface FormatOption {
  format: ExportFormat;
  label: string;
  icon: typeof FileText;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { format: 'pdf',  label: 'PDF Document',  icon: FileText },
  { format: 'xlsx', label: 'Excel (XLSX)',   icon: FileSpreadsheet },
  { format: 'docx', label: 'Word (DOCX)',    icon: File },
  { format: 'csv',  label: 'CSV',            icon: FileText },
];

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv:  'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf:  'application/pdf',
};

interface Props {
  reportType: string;
  filters?: Record<string, string>;
  disabled?: boolean;
}

export function ReportExportButton({ reportType, filters = {}, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleExport = async (format: ExportFormat) => {
    setLoading(format);
    setOpen(false);
    try {
      const params = new URLSearchParams({ format, ...filters });
      const response = await api.get(`/api/v1/reports/export/${reportType}?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: CONTENT_TYPES[format] });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${date}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={disabled || loading !== null}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white text-v-charcoal border border-gray-200 hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-v-pink focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {loading ? 'Exporting…' : 'Export'}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {FORMAT_OPTIONS.map(({ format, label, icon: Icon }) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-v-charcoal hover:bg-v-wash transition-colors text-left"
            >
              <Icon size={15} className="text-v-violet shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
