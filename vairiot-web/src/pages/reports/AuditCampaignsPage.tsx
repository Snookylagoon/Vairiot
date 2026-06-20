import { GenericReportPage } from './GenericReportPage';

export function AuditCampaignsPage() {
  return (
    <GenericReportPage
      title="Audit Reports"
      subtitle="Audit campaign results, reconciliation detail, and scan logs"
      variants={[
        { reportType: 'audit-campaign-summary', label: 'Campaign Summary', desc: 'Overview of all audit campaigns with completion and accuracy metrics' },
        { reportType: 'audit-reconciliation', label: 'Reconciliation Detail', desc: 'Item-level reconciliation results showing matched, missing, and unexpected assets' },
        { reportType: 'audit-scan-log', label: 'Scan Log', desc: 'Chronological log of all scans during audit campaigns' },
      ]}
    />
  );
}
