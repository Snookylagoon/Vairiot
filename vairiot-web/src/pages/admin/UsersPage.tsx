import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, User as UserIcon, ShieldCheck, Power } from 'lucide-react';
import {
  useUsers, useRoles, useInviteUser, useSetUserActive, useSetUserRole,
} from '@/hooks/useAdmin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inviteUserSchema, type InviteUserFormData } from '@/lib/schemas';

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const invite     = useInviteUser();
  const setActive  = useSetUserActive();
  const setRole    = useSetUserRole();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
  });
  const [toggleTarget, setToggleTarget] = useState<{ userId: string; name: string; active: boolean } | null>(null);

  const onInvite = async (data: InviteUserFormData) => {
    await invite.mutateAsync({
      email:    data.email,
      name:     data.name,
      password: data.password,
      roleId:   data.roleId || undefined,
    });
    reset();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Users</h1>
        <p className="text-sm text-gray-500 mt-1">Invite teammates, assign roles, enable or disable access.</p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit(onInvite)} className="space-y-3">
            <h3 className="font-semibold text-v-charcoal text-sm">Invite User</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Name *"     placeholder="Jane Doe"            error={errors.name?.message}     {...register('name')} />
              <Input label="Email *"    placeholder="jane@company.com"    error={errors.email?.message}    {...register('email')} type="email" />
              <Input label="Initial password *" placeholder="8+ characters" error={errors.password?.message} {...register('password')} type="password" />
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
            <Button type="submit" loading={invite.isPending}>
              <UserPlus size={15} className="mr-1.5" /> Invite User
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {users.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <UserIcon size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No users yet.</p>
            </div>
          )}
          {users.map(u => {
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
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-gray-400" />
                  <select
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-v-charcoal focus:outline-none focus:ring-2 focus:ring-v-pink"
                    value={currentRoleId}
                    onChange={e => setRole.mutate({ userId: u.id, roleId: e.target.value })}>
                    <option value="" disabled>— Select role —</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
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
