import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth.store';

/** Administrators without two-factor: when it becomes required (D6, stage 1.18). */
export function TwoFactorDueBanner() {
  const due = useAuthStore(s => s.user?.twoFactorSetupDueBy);
  if (!due) return null;
  const date = new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800">
      <ShieldAlert size={16} />
      <span>Two-factor authentication is required for your role from <strong>{date}</strong>.</span>
      <Link to="/settings/2fa" className="font-semibold underline">Set it up now</Link>
    </div>
  );
}
