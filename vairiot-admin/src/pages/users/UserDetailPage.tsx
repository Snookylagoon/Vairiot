import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, RotateCcw } from 'lucide-react';
import type { Permission } from 'vairiot-shared';
import { useAllUsers, useUserPermissions, useSetUserPermissions } from '@/hooks/useAdmin';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface UserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  twoFactorEnabled: boolean;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  tenant?: { name: string };
  roles?: { role: { name: string } }[];
}

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
  { key: 'licence',   label: 'Licensing',                 actions: [{ perm: 'licence:manage', label: 'Manage' }] },
  { key: 'system',    label: 'System Configuration',      actions: [{ perm: 'system:configure', label: 'Configure' }] },
];

const ALL_MATRIX_PERMS: Permission[] = MODULES.flatMap(m =>
  [...(m.view ? [m.view] : []), ...m.actions.map(a => a.perm)],
);

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const { data: users = [], isLoading } = useAllUsers();
  const { data: perms, isLoading: permsLoading } = useUserPermissions(id);
  const save = useSetUserPermissions();

  const user = (users as UserRow[]).find(u => u.id === id);

  const canEdit = me?.permissions.includes('user:write') ?? false;

  const roleSet = useMemo(() => new Set(perms?.rolePermissions ?? []), [perms]);

  // Local draft of the effective state per permission. We seed it from `effective`
  // when the server data arrives and reset it whenever the underlying data changes.
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

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const roleNames = user.roles?.map(r => r.role.name) ?? [];

  const isOverridden = (perm: Permission) => draft[perm] !== roleSet.has(perm);

  const dirty = ALL_MATRIX_PERMS.some(p => {
    const roleDefault = roleSet.has(p);
    const original = perms?.effective.includes(p) ?? roleDefault;
    return (draft[p] ?? roleDefault) !== original;
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
    // Send only the permissions that diverge from the role default.
    const overrides = ALL_MATRIX_PERMS
      .filter(p => draft[p] !== roleSet.has(p))
      .map(p => ({ permission: p, granted: draft[p] }));
    await save.mutateAsync({ userId: id, overrides });
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/users')} className="flex items-center gap-1 text-sm text-v-violet hover:underline">
        <ArrowLeft size={16} /> Back to Users
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">{user.name}</h1>
        <Badge variant={user.active ? 'green' : 'gray'}>{user.active ? 'Active' : 'Disabled'}</Badge>
        {isLocked && <Badge variant="red">Locked</Badge>}
        <Badge variant={user.twoFactorEnabled ? 'green' : 'gray'}>{user.twoFactorEnabled ? '2FA On' : '2FA Off'}</Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">User Information</h2></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Email" value={user.email} mono />
            <Row label="Tenant" value={user.tenant?.name} />
            <Row label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Assigned Roles</h2></CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {roleNames.length > 0
                ? roleNames.map(name => <Badge key={name} variant="default">{name}</Badge>)
                : <p className="text-sm text-gray-400">No roles assigned</p>}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-h3 text-v-charcoal">Permission Matrix</h2>
              <p className="text-xs text-gray-400 mt-1">
                Ticked = function available. Unticked = not available. {canEdit
                  ? 'Toggle a box to override the role default for this user. A purple dot marks cells that differ from the role default. New permissions take effect on the user\'s next login.'
                  : 'Read-only — you do not have permission to edit overrides.'}
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={revertAllToRole} disabled={!dirty && (perms?.overrides.length ?? 0) === 0}>
                  <RotateCcw size={14} className="mr-1" /> Revert to Role Default
                </Button>
                <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-6 py-3 font-medium text-gray-500 w-1/3">Function</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-center">View</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => (
                  <tr key={mod.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 text-v-charcoal font-medium align-top">{mod.label}</td>
                    <td className="px-6 py-3 text-center align-top">
                      {mod.view ? (
                        <Tick
                          on={!!draft[mod.view]}
                          editable={canEdit}
                          overridden={isOverridden(mod.view)}
                          onClick={() => toggle(mod.view!)}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        {mod.actions.map(a => (
                          <div key={a.perm} className="flex items-center gap-2 text-gray-600">
                            <Tick
                              on={!!draft[a.perm]}
                              editable={canEdit}
                              overridden={isOverridden(a.perm)}
                              onClick={() => toggle(a.perm)}
                            />
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
    ? 'bg-v-violet border-v-violet text-white'
    : 'bg-white border-gray-300 text-gray-300';
  const hover = editable ? 'hover:ring-2 hover:ring-v-violet/40 cursor-pointer' : '';
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
