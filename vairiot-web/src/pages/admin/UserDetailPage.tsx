import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Permission } from 'vairiot-shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useUsers, useUserPermissions, useSetUserPermissions } from '@/hooks/useAdmin';
import { useAuthStore } from '@/stores/auth.store';

interface ModuleDef {
  key: string;
  label: string;
  view?: Permission;
  actions: { perm: Permission; label: string }[];
}

const MODULES: ModuleDef[] = [
  { key: 'asset',     label: 'Assets',                    view: 'asset:read',     actions: [{ perm: 'asset:write', label: 'Create / Update' }, { perm: 'asset:delete', label: 'Delete' }] },
  { key: 'site',      label: 'Sites & Locations',         view: 'site:read',      actions: [{ perm: 'site:write', label: 'Create / Update' }] },
  { key: 'category',  label: 'Categories',                view: 'category:read',  actions: [{ perm: 'category:write', label: 'Create / Update' }] },
  { key: 'audit',     label: 'Audit Campaigns',           view: 'audit:read',     actions: [{ perm: 'audit:write', label: 'Run / Manage' }] },
  { key: 'scan',      label: 'Scanning (RFID / Barcode)', actions: [{ perm: 'scan:execute', label: 'Execute Scan' }] },
  { key: 'report',    label: 'Reports',                   view: 'report:read',    actions: [{ perm: 'report:export', label: 'Export' }] },
  { key: 'workorder', label: 'Work Orders',               view: 'workorder:read', actions: [{ perm: 'workorder:write', label: 'Create / Update' }, { perm: 'workorder:assigned', label: 'Complete Assigned' }] },
  { key: 'user',      label: 'Users',                     view: 'user:read',      actions: [{ perm: 'user:write', label: 'Manage' }] },
  { key: 'apikey',    label: 'API Keys',                  view: 'apikey:read',    actions: [{ perm: 'apikey:write', label: 'Manage' }] },
  { key: 'company',   label: 'Company',                   actions: [{ perm: 'company:manage', label: 'Manage' }] },
  { key: 'client',    label: 'Client Companies',          view: 'client:read',    actions: [{ perm: 'client:manage', label: 'Manage' }] },
];

const ALL_MATRIX_PERMS: Permission[] = MODULES.flatMap(m =>
  [...(m.view ? [m.view] : []), ...m.actions.map(a => a.perm)],
);

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const { data: users = [], isLoading } = useUsers();
  const { data: perms, isLoading: permsLoading } = useUserPermissions(id);
  const save = useSetUserPermissions();

  const user = users.find(u => u.id === id);
  const canEdit = me?.permissions.includes('user:write') ?? false;

  const roleSet = useMemo(() => new Set(perms?.rolePermissions ?? []), [perms]);

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!perms) return;
    const next: Record<string, boolean> = {};
    const eff = new Set(perms.effective);
    for (const p of ALL_MATRIX_PERMS) next[p] = eff.has(p);
    setDraft(next);
  }, [perms]);

  if (isLoading || permsLoading) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  if (!user) return <div className="text-center py-12 text-gray-400">User not found</div>;

  const roleNames = user.roles?.map(r => r.role.name) ?? [];
  const isOverridden = (perm: Permission) => draft[perm] !== roleSet.has(perm);

  const dirty = ALL_MATRIX_PERMS.some(p => {
    const original = perms?.effective.includes(p) ?? roleSet.has(p);
    return (draft[p] ?? roleSet.has(p)) !== original;
  });

  const toggle = (perm: Permission) => {
    if (!canEdit) return;
    setDraft(d => ({ ...d, [perm]: !d[perm] }));
  };

  const revertAllToRole = () => {
    if (!canEdit) return;
    const next: Record<string, boolean> = {};
    for (const p of ALL_MATRIX_PERMS) next[p] = roleSet.has(p);
    setDraft(next);
  };

  const onSave = async () => {
    if (!id) return;
    const overrides = ALL_MATRIX_PERMS
      .filter(p => draft[p] !== roleSet.has(p))
      .map(p => ({ permission: p, granted: draft[p] }));
    await save.mutateAsync({ userId: id, overrides });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <button onClick={() => navigate('/admin/users')} className="flex items-center gap-1 text-sm text-v-pink hover:underline">
        <ArrowLeft size={16} /> Back to Users
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-v-charcoal">{user.name}</h1>
        <Badge variant={user.active ? 'green' : 'gray'}>{user.active ? 'Active' : 'Disabled'}</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardBody className="space-y-2 text-sm">
            <h2 className="font-semibold text-v-charcoal mb-2">User Information</h2>
            <Row label="Email" value={user.email} mono />
            <Row label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="font-semibold text-v-charcoal mb-2">Assigned Roles</h2>
            <div className="flex flex-wrap gap-2">
              {roleNames.length > 0
                ? roleNames.map(name => <Badge key={name} variant="default">{name}</Badge>)
                : <p className="text-sm text-gray-400">No roles assigned</p>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-v-charcoal">Permission Matrix</h2>
              <p className="text-xs text-gray-400 mt-1">
                Ticked = function available. Unticked = not available. {canEdit
                  ? 'Toggle a box to override the role default. An amber dot marks cells that differ from the role default. Changes take effect on next login.'
                  : 'Read-only — you do not have permission to edit overrides.'}
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={revertAllToRole} disabled={!dirty && (perms?.overrides.length ?? 0) === 0}>
                  <RotateCcw size={14} className="mr-1" /> Revert to Role
                </Button>
                <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending} loading={save.isPending}>
                  Save Changes
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-5 py-3 font-medium text-gray-500 w-1/3">Function</th>
                  <th className="px-5 py-3 font-medium text-gray-500 text-center">View</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => (
                  <tr key={mod.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-v-charcoal font-medium align-top">{mod.label}</td>
                    <td className="px-5 py-3 text-center align-top">
                      {mod.view ? (
                        <Tick on={!!draft[mod.view]} editable={canEdit} overridden={isOverridden(mod.view)} onClick={() => toggle(mod.view!)} />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        {mod.actions.map(a => (
                          <div key={a.perm} className="flex items-center gap-2 text-gray-600">
                            <Tick on={!!draft[a.perm]} editable={canEdit} overridden={isOverridden(a.perm)} onClick={() => toggle(a.perm)} />
                            <span className={canEdit ? 'cursor-pointer select-none' : ''} onClick={() => toggle(a.perm)}>
                              {a.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Tick({ on, editable, overridden, onClick }: { on: boolean; editable: boolean; overridden: boolean; onClick?: () => void }) {
  const base = 'relative inline-flex items-center justify-center h-5 w-5 rounded border transition-colors';
  const state = on
    ? 'bg-v-pink border-v-pink text-white'
    : 'bg-white border-gray-300 text-gray-300';
  const hover = editable ? 'hover:ring-2 hover:ring-v-pink/40 cursor-pointer' : '';
  return (
    <span
      role={editable ? 'checkbox' : undefined}
      aria-checked={editable ? on : undefined}
      onClick={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); } : undefined}
      className={`${base} ${state} ${hover}`}
      title={overridden ? 'Overridden — differs from role default' : undefined}
    >
      {on ? <Check size={14} strokeWidth={3} /> : <X size={12} />}
      {overridden && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 border border-white" />
      )}
    </span>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`text-v-charcoal font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}
