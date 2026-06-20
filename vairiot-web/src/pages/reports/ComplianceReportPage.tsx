import { GenericReportPage } from './GenericReportPage';

export function ComplianceReportPage() {
  return (
    <GenericReportPage
      title="Compliance Reports"
      subtitle="Compliance status and company profile"
      variants={[
        { reportType: 'compliance-overview', label: 'Compliance Overview', desc: 'Compliance status across all asset management areas' },
        { reportType: 'company-profile', label: 'Company Profile', desc: 'Registered company details and client companies' },
      ]}
    />
  );
}
