import { GenericReportPage } from './GenericReportPage';

export function TenantsReportPage() {
  return (
    <GenericReportPage
      title="Tenant & Company Reports"
      subtitle="Tenant register, activity metrics, company profile, and compliance"
      variants={[
        { reportType: 'tenant-register', label: 'Tenant Register', desc: 'All tenants with subscription details and asset counts' },
        { reportType: 'tenant-activity', label: 'Tenant Activity', desc: 'Activity metrics across tenants' },
        { reportType: 'company-profile', label: 'Company Profile', desc: 'Registered company details and associated clients' },
        { reportType: 'compliance-overview', label: 'Compliance Overview', desc: 'Compliance status across asset management areas' },
      ]}
    />
  );
}
