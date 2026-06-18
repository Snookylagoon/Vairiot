import { useState } from 'react';
import { UserPlus, User as UserIcon, ShieldCheck, Power } from 'lucide-react';
import {
  useUsers, useRoles, useInviteUser, useSetUserActive, useSetUserRole,
} from '@/hooks/useAdmin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const invite     = useInviteUser();
  const setActive  = useSetUserActive();
  const setRole    = useSetUserRole();

  const [form, setForm] = useState({ email: '', name: '', password: '', roleId: '' });
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleInvite = async () => {
    if (!form.email.trim() || !form.name.trim() || form.password.length < 8) {
      setError('Email, name, and an 8+ character password are required'); return;
    }
    try {
      setError('');
      await invite.mutateAsync({
        email:    form.email.trim(),
        name:     form.name.trim(),
        password: form.password,
        roleId:   form.roleId || undefined,
      });
      setForm({ email: '', name: '', password: '', roleId: '' });
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to create user');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Users</h1>
        <p className="text-sm text-gray-500 mt-1">Invite teammates, assign roles, enable or disable access.</p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-v-charcoal text-sm">Invite User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Name *"     placeholder="Jane Doe"            value={form.name}     onChange={e => set('name', e.target.value)} />
            <Input label="Email *"    placeholder="jane@company.com"    value={form.email}    onChange={e => set('email', e.target.value)} type="email" />
            <Input label="Initial password *" placeholder="8+ characters" value={form.password} onChange={e => set('password', e.target.value)} type="password" />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-v-charcoal">Role</label>
              <select
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-v-charcoal hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-v-pink focus:border-transparent"
                value={form.roleId} onChange={e => set('roleId', e.target.value)}>
                <option value="">— No role —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button onClick={handleInvite} loading={invite.isPending}>
            <UserPlus size={15} className="mr-1.5" /> Invite User
          </Button>
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
                    onClick={() => setActive.mutate({ userId: u.id, active: !u.active })}>
                    <Power size={12} className="mr-1" />
                    {u.active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
