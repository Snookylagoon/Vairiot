import { GenericReportPage } from './GenericReportPage';

export function LicencesReportPage() {
  return (
    <GenericReportPage
      title="Licence Reports"
      subtitle="Licence register, expiry tracking, and device allocation"
      variants={[
        { reportType: 'licence-register', label: 'Licence Register', desc: 'All licences with tier, status, and payment information' },
        { reportType: 'licence-expiry', label: 'Licence Expiry', desc: 'Licences approaching or past expiry with revenue at risk' },
        { reportType: 'device-allocation', label: 'Device Allocation', desc: 'Device usage and allocation by licence' },
      ]}
    />
  );
}
