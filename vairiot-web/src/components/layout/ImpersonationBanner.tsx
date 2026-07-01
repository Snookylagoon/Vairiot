import { useQueryClient } from '@tanstack/react-query';
import { Eye, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Full-width banner rendered above the app content when a parent-tenant
 * admin is viewing a sub-tenant. Provides an obvious escape hatch so they
 * can never confuse whose data they're editing.
 */
export function ImpersonationBanner() {
  const { user, switchTenantContext } = useAuthStore();
  const qc = useQueryClient();

  if (!user?.originalTenantId || user.originalTenantId === user.tenantId) return null;

  const returnToParent = async () => {
    try {
      await switchTenantContext(user.originalTenantId!);
      qc.clear();
      toast.success(`Returned to ${user.originalTenantName ?? 'main tenant'}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Failed to return to main tenant');
    }
  };

  return (
    <div className="bg-v-gradient text-white text-sm px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <Eye size={16} className="shrink-0" />
        <p className="truncate">
          Viewing sub-tenant: <span className="font-semibold">{user.tenantName}</span>
        </p>
      </div>
      <button
        onClick={returnToParent}
        className="flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-medium shrink-0"
      >
        <LogOut size={12} />
        Return to {user.originalTenantName ?? 'main tenant'}
      </button>
    </div>
  );
}
