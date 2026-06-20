import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllUsers, useResetPassword, useUnlockUser, useSetUserActive } from '@/hooks/useAdmin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { KeyRound, Unlock, UserX, UserCheck, Copy, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { RoleMatrixDialog } from './RoleMatrixDialog';

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

export function UsersPage() {
  const navigate = useNavigate();
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } =
    useUrlTableState(['active']);
  const activeFilter = extras.active;

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (activeFilter) params.active = activeFilter;
  if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }

  const { data: users = [], isLoading } = useAllUsers(params);
  const resetPassword = useResetPassword();
  const unlockUser = useUnlockUser();
  const setUserActive = useSetUserActive();

  const [confirm, setConfirm] = useState<{ action: string; userId: string; name: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

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

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: 'name', label: 'User',
      render: u => (
        <>
          <p className="font-medium text-v-charcoal">{u.name}</p>
          <p className="text-xs text-gray-400">{u.email}</p>
        </>
      ),
    },
    {
      key: 'roles', label: 'Roles', sortable: false,
      render: u => (
        <div className="flex flex-wrap gap-1">
          {u.roles?.map(ur => <Badge key={ur.role.name} variant="default">{ur.role.name}</Badge>)}
        </div>
      ),
    },
    {
      key: 'active', label: 'Status',
      render: u => {
        const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={u.active ? 'green' : 'gray'}>{u.active ? 'Active' : 'Disabled'}</Badge>
            {isLocked && <Badge variant="red">Locked</Badge>}
          </div>
        );
      },
    },
    {
      key: 'twoFactorEnabled', label: '2FA',
      render: u => (
        <Badge variant={u.twoFactorEnabled ? 'green' : 'gray'}>
          {u.twoFactorEnabled ? 'Enabled' : 'Off'}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt', label: 'Last Login',
      render: u => (
        <span className="text-xs text-gray-400">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: u => {
        const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
        return (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
        );
      },
    },
  ];

  const toolbar = (
    <div className="flex gap-1">
      {[['', 'All'], ['true', 'Active'], ['false', 'Disabled']].map(([val, label]) => (
        <button
          key={val}
          onClick={() => setExtra('active', val)}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
            activeFilter === val ? 'bg-v-violet text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">Users</h1>
        <Button size="sm" variant="secondary" onClick={() => setMatrixOpen(true)}>
          <Table2 size={14} className="mr-1" /> Role Permission Matrix
        </Button>
      </div>

      <DataTable<UserRow>
        columns={columns}
        rows={users as UserRow[]}
        getRowKey={u => u.id}
        onRowClick={u => navigate(`/users/${u.id}`)}
        isLoading={isLoading}
        emptyMessage="No users found"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search by name or email…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
        groupBy={{
          keyOf: u => u.tenant?.name || '∅',
          labelOf: u => (
            <span className="flex items-baseline gap-2">
              <span>{u.tenant?.name || 'No tenant'}</span>
            </span>
          ),
        }}
      />

      <RoleMatrixDialog open={matrixOpen} onClose={() => setMatrixOpen(false)} />

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
