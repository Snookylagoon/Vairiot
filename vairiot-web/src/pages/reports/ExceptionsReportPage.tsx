import { GenericReportPage } from './GenericReportPage';

export function ExceptionsReportPage() {
  return (
    <GenericReportPage
      title="Exception Reports"
      subtitle="Exception summary and alert subscription configuration"
      variants={[
        { reportType: 'exception-summary', label: 'Exception Summary', desc: 'Warranty expiries, overdue checkouts, maintenance, and other exceptions' },
        { reportType: 'alert-subscriptions', label: 'Alert Subscriptions', desc: 'Active alert subscription configuration by user' },
      ]}
    />
  );
}
