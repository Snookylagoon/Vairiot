import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReportExportButton } from '@/components/reports/ReportExportButton';

interface ReportVariant {
  reportType: string;
  label: string;
  desc: string;
}

interface Props {
  title: string;
  subtitle: string;
  variants: ReportVariant[];
}

export function GenericReportPage({ title, subtitle, variants }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Reports
      </button>

      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {variants.map(v => (
          <div key={v.reportType} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-v-charcoal">{v.label}</p>
              <p className="text-xs text-gray-500 mt-1">{v.desc}</p>
            </div>
            <ReportExportButton reportType={v.reportType} />
          </div>
        ))}
      </div>
    </div>
  );
}
