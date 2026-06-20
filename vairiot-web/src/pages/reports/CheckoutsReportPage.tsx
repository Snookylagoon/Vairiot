import { GenericReportPage } from './GenericReportPage';

export function CheckoutsReportPage() {
  return (
    <GenericReportPage
      title="Checkout Reports"
      subtitle="Asset checkout history, current status, and frequency analysis"
      variants={[
        { reportType: 'checkout-log', label: 'Checkout Log', desc: 'Complete record of all checkouts and returns' },
        { reportType: 'current-checkouts', label: 'Currently Checked Out', desc: 'Assets currently assigned to custodians' },
        { reportType: 'checkout-history-by-asset', label: 'History by Asset', desc: 'Checkout frequency and duration analysis per asset' },
      ]}
    />
  );
}
