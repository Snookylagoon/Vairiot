import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApprovalInbox } from '@/hooks/useApprovals';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

/** The header's count of what waits for the user's decision (stage 3.3, D22). */
export function ApprovalBadge() {
  const user = useAuthStore(s => s.user);
  const decides = hasAnyPermission(user, 'approval:decide', 'accounting:approve');
  const { data } = useApprovalInbox(decides);
  if (!decides) return null;
  const count = data?.count ?? 0;
  return (
    <Link to="/approvals" className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100"
      aria-label={count ? `${count} waiting for your approval` : 'Approvals: nothing waiting'}>
      <ClipboardCheck size={20} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-v-pink text-white text-[10px] font-semibold leading-4 text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
