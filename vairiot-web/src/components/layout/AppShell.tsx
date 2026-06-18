import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ClipboardList, LogOut, Menu, Tag, MapPin, Users, KeyRound, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore, hasPermission } from '@/stores/auth.store';
import clsx from 'clsx';

const nav = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/assets',     label: 'Assets',     icon: Package },
  { to: '/categories', label: 'Categories', icon: Tag },
  { to: '/sites',      label: 'Sites',      icon: MapPin },
  { to: '/audits',     label: 'Audits',     icon: ClipboardList },
  { to: '/admin/users',    label: 'Users',    icon: Users,    require: ['user:read', 'user:write'] },
  { to: '/admin/api-keys', label: 'API Keys', icon: KeyRound, require: ['apikey:read', 'apikey:write'] },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ScrollText, require: ['user:read', 'user:write', 'apikey:read', 'apikey:write'] },
] as const;

export function AppShell() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const visibleNav = nav.filter(item => !('require' in item) || hasPermission(user, ...item.require));

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-v-charcoal transform transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:relative lg:translate-x-0',
      )}>
        {/* Logo band — gradient */}
        <div className="h-16 flex items-center px-4 bg-gradient-to-r from-v-pink via-v-mauve to-v-violet">
          <span className="text-white font-bold text-xl tracking-wide font-sans">VAIRIOT</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-v-violet text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white',
              )}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <p className="text-xs text-gray-500 px-3 mb-2 truncate">{user?.email}</p>
          <button onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b border-gray-200 lg:px-6">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Vairiot Enhanced Asset Management</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
