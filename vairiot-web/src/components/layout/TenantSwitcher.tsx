import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface SwitchableTenant {
  id: string;
  name: string;
  legalName: string | null;
  isParent: boolean;
  isCurrent: boolean;
}

interface SwitchableResponse {
  tenants: SwitchableTenant[];
}

/**
 * Header chip that lets a parent-tenant admin drop into any of their
 * sub-tenants. Renders nothing for sub-tenant users (they have no
 * switchable tenants) and for parents with no children yet.
 */
export function TenantSwitcher() {
  const { user, switchTenantContext } = useAuthStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only fetch when the user can actually manage sub-tenants — otherwise the
  // endpoint returns 403 and we'd surface an unnecessary console noise.
  const canManage = user?.permissions?.includes('company:manage') ?? false;

  const { data } = useQuery<SwitchableResponse>({
    queryKey: ['switchable-tenants'],
    queryFn: () => api.get('/api/v1/company/switchable-tenants').then(r => r.data),
    enabled: canManage,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const tenants = data?.tenants ?? [];
  // Hide the switcher entirely if there's nothing to switch between.
  if (tenants.length <= 1) return null;

  const pickTenant = async (id: string) => {
    if (id === user?.tenantId) { setOpen(false); return; }
    setSwitching(id);
    try {
      await switchTenantContext(id);
      // Flush every cached query so pages re-fetch under the new tenantId.
      qc.clear();
      toast.success('Switched tenant');
      setOpen(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Failed to switch tenant';
      toast.error(msg);
    } finally {
      setSwitching(null);
    }
  };

  const currentDisplay =
    tenants.find(t => t.isCurrent)?.legalName ??
    tenants.find(t => t.isCurrent)?.name ??
    user?.tenantName ??
    'Tenant';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-v-pink"
      >
        <Building2 size={14} className="text-v-violet" />
        <span className="font-medium text-v-charcoal truncate max-w-[160px]">{currentDisplay}</span>
        <ChevronDown size={14} className={clsx('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100">
            Switch tenant
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {tenants.map(t => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pickTenant(t.id)}
                  disabled={switching !== null}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 text-left text-sm',
                    t.isCurrent ? 'bg-v-wash text-v-violet' : 'hover:bg-gray-50 text-v-charcoal',
                    switching === t.id && 'opacity-60',
                  )}
                >
                  <Building2 size={14} className="shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.legalName ?? t.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {t.isParent ? 'Your main tenant' : `Sub-tenant · ${t.id}`}
                    </p>
                  </div>
                  {t.isCurrent && <Check size={14} className="text-v-violet shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
