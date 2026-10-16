import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSetTenantModule, useTenantModules, type TenantModule } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The tenant's switchable modules (D7, stage 2.2). Switching one off hides its
 * screens and answers 404 on its routes; nothing stored is deleted, so
 * switching it back on restores everything. Only a Platform Super Admin can
 * switch; every change is in the audit log.
 */
export function TenantModulesCard({ tenantId }: { tenantId: string }) {
  const { data: modules = [], isLoading } = useTenantModules(tenantId);
  const setModule = useSetTenantModule(tenantId);
  const canSwitch = useAuthStore(s => s.user?.roles.includes('Platform Super Admin') ?? false);
  const [turningOff, setTurningOff] = useState<TenantModule | null>(null);

  const toggle = (m: TenantModule) => {
    if (m.enabled) setTurningOff(m);
    else setModule.mutate({ key: m.key, enabled: true });
  };

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">Modules</h2></CardHeader>
      <CardBody className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {modules.map(m => (
          <label key={m.key} className="flex items-start justify-between gap-4 py-1">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-v-charcoal">
                {m.name}
                {m.status === 'in_development' && <Badge variant="yellow">In development</Badge>}
              </span>
              <span className="block text-xs text-gray-500">{m.description} Built in {m.builtIn}.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label={`${m.name} module`}
              className="mt-1 h-4 w-4 accent-v-violet"
              checked={m.enabled}
              disabled={!canSwitch || setModule.isPending}
              onChange={() => toggle(m)}
            />
          </label>
        ))}
        {!canSwitch && <p className="text-xs text-gray-400">Only a Platform Super Admin can switch modules.</p>}
      </CardBody>
      <ConfirmDialog
        open={turningOff !== null}
        title={`Switch off ${turningOff?.name ?? ''}?`}
        description="Its screens disappear for everyone in this organisation and its features stop answering. Nothing is deleted: switching it back on restores it as it was."
        confirmLabel="Switch off"
        variant="danger"
        loading={setModule.isPending}
        onConfirm={() => {
          if (turningOff) setModule.mutate({ key: turningOff.key, enabled: false }, { onSettled: () => setTurningOff(null) });
        }}
        onCancel={() => setTurningOff(null)}
      />
    </Card>
  );
}
