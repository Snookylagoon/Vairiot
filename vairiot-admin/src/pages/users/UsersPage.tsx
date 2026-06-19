import { useState } from 'react';
import { useAllUsers, useResetPassword, useUnlockUser, useSetUserActive } from '@/hooks/useAdmin';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Search, KeyRound, Unlock, UserX, UserCheck, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (activeFilter) params.active = activeFilter;

  const { data: users = [], isLoading } = useAllUsers(params);
  const resetPassword = useResetPassword();
  const unlockUser = useUnlockUser();
  const setUserActive = useSetUserActive();

  const [confirm, setConfirm] = useState<{ action: string; userId: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleAction = async () => {
    if (!confirm) return;
    const { action, userId } = confirm;
    if (action === 'reset') {
      const result = await resetPassword.mutateAsync(userId);
      setTempPassword(result.temporaryPassword);
      setConfirm(null);
      return;
    }
    if (action === 'unlock') await unlockUser.mutateAsync(userId);
    if (action === 'disable') await setUserActive.mutateAsync({ userId, active: false });
    if (action === 'enable') await setUserActive.mutateAsync({ userId, active: true });
    setConfirm(null);
  };

  const copyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      toast.success('Password copied to clipboard');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-v-charcoal">Users</h1>

      <div className="flex items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
          />
        </div>
        <div className="flex gap-1">
          {[['', 'All'], ['true', 'Active'], ['false', 'Disabled']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setActiveFilter(val)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                activeFilter === val
                  ? 'bg-v-violet text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">User</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Tenant</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Roles</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500">2FA</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Last Login</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => {
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-v-charcoal">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-v-charcoal">{u.tenant?.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{u.tenant?.slug}</p>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((ur: any) => (
                            <Badge key={ur.role.name} variant="default">{ur.role.name}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={u.active ? 'green' : 'gray'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                          {isLocked && <Badge variant="red">Locked</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={u.twoFactorEnabled ? 'green' : 'gray'}>
                          {u.twoFactorEnabled ? 'Enabled' : 'Off'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-400">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" title="Reset Password"
                            onClick={() => setConfirm({ action: 'reset', userId: u.id, name: u.name })}>
                            <KeyRound size={14} />
                          </Button>
                          {isLocked && (
                            <Button size="sm" variant="ghost" title="Unlock"
                              onClick={() => setConfirm({ action: 'unlock', userId: u.id, name: u.name })}>
                              <Unlock size={14} />
                            </Button>
                          )}
                          {u.active ? (
                            <Button size="sm" variant="ghost" title="Disable"
                              onClick={() => setConfirm({ action: 'disable', userId: u.id, name: u.name })}>
                              <UserX size={14} />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" title="Enable"
                              onClick={() => setConfirm({ action: 'enable', userId: u.id, name: u.name })}>
                              <UserCheck size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.action === 'reset' ? 'Reset Password' :
          confirm?.action === 'unlock' ? 'Unlock User' :
          confirm?.action === 'disable' ? 'Disable User' : 'Enable User'
        }
        description={
          confirm?.action === 'reset'
            ? `Generate a temporary password for ${confirm?.name}? They will need to change it on next login.`
            : `Are you sure you want to ${confirm?.action} ${confirm?.name}?`
        }
        confirmLabel={confirm?.action === 'reset' ? 'Reset' : confirm?.action === 'disable' ? 'Disable' : confirm?.action === 'unlock' ? 'Unlock' : 'Enable'}
        variant={confirm?.action === 'disable' ? 'danger' : 'primary'}
        loading={resetPassword.isPending || unlockUser.isPending || setUserActive.isPending}
        onConfirm={handleAction}
        onCancel={() => setConfirm(null)}
      />

      {/* Temporary password modal */}
      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-bold text-v-charcoal">Temporary Password</h3>
            <p className="text-sm text-gray-600">
              Share this password securely with the user. They will be required to change it on next login.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3">
              <code className="flex-1 font-mono text-lg tracking-wider text-v-charcoal">{tempPassword}</code>
              <button onClick={copyPassword} className="p-1.5 text-gray-400 hover:text-v-violet transition-colors">
                <Copy size={18} />
              </button>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTempPassword(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
