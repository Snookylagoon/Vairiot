import { Outlet, NavLink, useOutletContext } from 'react-router-dom';
import { LayoutDashboard, Building2, BadgeCheck, Users, ScrollText, Mail, LogOut, Menu, KeyRound } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import clsx from 'clsx';

type ShellContext = { setHeaderSubtitle: (s: string | null) => void };
export function useShellContext() { return useOutletContext<ShellContext>(); }

const nav = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/tenants',    label: 'Tenants',     icon: Building2 },
  { to: '/licences',   label: 'Licences',    icon: BadgeCheck },
  { to: '/users',      label: 'Users',       icon: Users },
  { to: '/audit-log',  label: 'Audit Log',   icon: ScrollText },
  { to: '/smtp',       label: 'SMTP',        icon: Mail },
] as const;

export function AdminShell() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [headerSubtitle, setHeaderSubtitle] = useState<string | null>(null);
  const setSubtitle = useCallback((s: string | null) => setHeaderSubtitle(s), []);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-slate-800 transform transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
      )}>
        <div className="h-16 flex items-center px-4 bg-gradient-to-r from-v-pink via-v-mauve to-v-violet">
          <span className="text-white font-bold text-xl tracking-wide font-sans">VAIRIOT</span>
          <span className="ml-2 text-white/80 text-xs font-medium tracking-widest uppercase">Admin</span>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
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

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <p className="text-xs text-gray-500 px-3 truncate">{user?.email}</p>
          <NavLink to="/profile/password" onClick={() => setOpen(false)}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-v-violet text-white'
                : 'text-gray-400 hover:bg-white/10 hover:text-white',
            )}>
            <KeyRound size={18} />
            Change password
          </NavLink>
          <button onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 bg-white border-b border-gray-200 lg:px-6">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Vairiot Management Portal</span>
            {(headerSubtitle || user?.tenantName) && (
              <>
                <span className="text-sm text-gray-300">—</span>
                <span className="text-sm font-bold text-v-charcoal">{headerSubtitle ?? user?.tenantName}</span>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet context={{ setHeaderSubtitle: setSubtitle }} />
        </main>
      </div>
    </div>
  );
}
