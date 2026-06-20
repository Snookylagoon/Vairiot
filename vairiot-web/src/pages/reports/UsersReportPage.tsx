import { GenericReportPage } from './GenericReportPage';

export function UsersReportPage() {
  return (
    <GenericReportPage
      title="User Reports"
      subtitle="User register, access permissions, and activity audit trail"
      variants={[
        { reportType: 'user-register', label: 'User Register', desc: 'All users with roles, login status, and 2FA configuration' },
        { reportType: 'user-access-report', label: 'User Access Report', desc: 'User permissions and role assignments' },
        { reportType: 'user-activity-log', label: 'Activity Log', desc: 'Audit trail of user actions across the system' },
      ]}
    />
  );
}
