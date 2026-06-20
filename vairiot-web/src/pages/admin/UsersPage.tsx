import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, User as UserIcon, ShieldCheck, Power, Search, MailPlus, KeyRound, Table2, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoleMatrixDialog } from './RoleMatrixDialog';
import {
  useUsers, useRoles, useInviteUser, useSetUserActive, useSetUserRole, useResendInvite,
} from '@/hooks/useAdmin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inviteUserSchema, type InviteUserFormData } from '@/lib/schemas';

export function UsersPage() {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const invite      = useInviteUser();
  const setActive   = useSetUserActive();
  const setRole     = useSetUserRole();
  const resendInvite = useResendInvite();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
  });
  const [toggleTarget, setToggleTarget] = useState<{ userId: string; name: string; active: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [showDisabled, setShowDisabled] = useState(true);

  const filtered = useMemo(() => {
    let list = users;
    if (!showDisabled) list = list.filter(u => u.active);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [users, search, showDisabled]);
  const disabledCount = useMemo(() => users.filter(u => !u.active).length, [users]);

  const onInvite = async (data: InviteUserFormData) => {
    await invite.mutateAsync({
      email:  data.email,
      name:   data.name,
      roleId: data.roleId || undefined,
    });
    reset();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Invite teammates, assign roles, enable or disable access.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowDisabled(s => !s)}>
            {showDisabled
              ? <><EyeOff size={14} className="mr-1" /> Hide Disabled{disabledCount > 0 && ` (${disabledCount})`}</>
              : <><Eye size={14} className="mr-1" /> Show Disabled{disabledCount > 0 && ` (${disabledCount})`}</>}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMatrixOpen(true)}>
            <Table2 size={14} className="mr-1" /> Role Permission Matrix
          </Button>
        </div>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit(onInvite)} className="space-y-3">
            <h3 className="font-semibold text-v-charcoal text-sm">Invite User</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Name *"     placeholder="Jane Doe"            error={errors.name?.message}     {...register('name')} />
              <Input label="Email *"    placeholder="jane@company.com"    error={errors.email?.message}    {...register('email')} type="email" />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-v-charcoal">Role</label>
                <select
                  className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-v-charcoal hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent"
                  {...register('roleId')}>
                  <option value="">— No role —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500">An invitation email will be sent so the user can set their own password.</p>
            <Button type="submit" loading={invite.isPending}>
              <UserPlus size={15} className="mr-1.5" /> Invite User
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink" />
      </div>

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {filtered.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <UserIcon size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">{search ? 'No matching users.' : 'No users yet.'}</p>
            </div>
          )}
          {filtered.map(u => {
            const currentRoleId = u.roles[0]?.role.id ?? '';
            return (
              <div key={u.id} className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-v-charcoal truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  <p className="text-xs text-v-mauve mt-0.5">
                    {u.active ? 'Active' : 'Disabled'}
                    {u.lastLoginAt && ` • Last login ${new Date(u.lastLoginAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" title="Permissions"
                    onClick={() => navigate(`/admin/users/${u.id}`)}>
                    <KeyRound size={12} className="mr-1" /> Permissions
                  </Button>
                  <ShieldCheck size={14} className="text-gray-400" />
                  <select
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-v-charcoal focus:outline-none focus:ring-2 focus:ring-v-pink"
                    value={currentRoleId}
                    onChange={e => setRole.mutate({ userId: u.id, roleId: e.target.value })}>
                    <option value="" disabled>— Select role —</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {!u.active && !u.lastLoginAt && (
                    <Button size="sm" variant="secondary"
                      loading={resendInvite.isPending}
                      onClick={() => resendInvite.mutate(u.id)}>
                      <MailPlus size={12} className="mr-1" /> Resend
                    </Button>
                  )}
                  <Button size="sm" variant={u.active ? 'secondary' : 'primary'}
                    onClick={() => setToggleTarget({ userId: u.id, name: u.name, active: u.active })}>
                    <Power size={12} className="mr-1" />
                    {u.active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <RoleMatrixDialog open={matrixOpen} onClose={() => setMatrixOpen(false)} />

      <ConfirmDialog
        open={toggleTarget !== null}
        title={toggleTarget?.active ? 'Disable User' : 'Enable User'}
        description={
          toggleTarget?.active
            ? `Disable "${toggleTarget.name}"? They will not be able to log in until re-enabled.`
            : `Re-enable "${toggleTarget?.name}"? They will regain access immediately.`
        }
        confirmLabel={toggleTarget?.active ? 'Disable' : 'Enable'}
        variant={toggleTarget?.active ? 'danger' : 'primary'}
        loading={setActive.isPending}
        onConfirm={() => {
          if (toggleTarget) {
            setActive.mutate({ userId: toggleTarget.userId, active: !toggleTarget.active });
            setToggleTarget(null);
          }
        }}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
