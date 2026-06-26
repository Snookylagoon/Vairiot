import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ClipboardList, LogOut, Menu, Tag, MapPin, Users, KeyRound, ScrollText, ArrowLeftRight, Wrench, AlertTriangle, BarChart3, Bell, Webhook, Upload, QrCode, Settings2, ShieldCheck, BadgeCheck, ChevronDown, type LucideIcon } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useAuthStore, hasAnyPermission } from '@/stores/auth.store';
import { useCurrencyStore, CURRENCIES } from '@/stores/currency.store';
import { useDeviceHeartbeat } from '@/hooks/useLicensing';
import clsx from 'clsx';

type NavItem = { to: string; label: string; icon: LucideIcon; require?: readonly string[] };
type NavGroup = { heading: string; items: readonly NavItem[] };
type NavEntry = NavItem | NavGroup;

const nav: readonly NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    heading: 'Asset Management',
    items: [
      { to: '/assets',     label: 'Assets',     icon: Package },
      { to: '/categories', label: 'Categories', icon: Tag },
      { to: '/sites',      label: 'Sites',      icon: MapPin },
      { to: '/labels',     label: 'Labels',     icon: QrCode },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/audits',      label: 'Audits',       icon: ClipboardList },
      { to: '/checkouts',   label: 'Checkouts',    icon: ArrowLeftRight },
      { to: '/maintenance', label: 'Maintenance',  icon: Wrench },
      { to: '/exceptions',  label: 'Exceptions',   icon: AlertTriangle },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/alerts',  label: 'Alerts',  icon: Bell },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { to: '/import', label: 'Import', icon: Upload },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/admin/users',         label: 'Users',         icon: Users,    require: ['user:read', 'user:write'] },
      { to: '/admin/api-keys',      label: 'API Keys',      icon: KeyRound, require: ['apikey:read', 'apikey:write'] },
      { to: '/admin/webhooks',      label: 'Webhooks',      icon: Webhook,  require: ['apikey:write'] },
      { to: '/admin/custom-fields', label: 'Custom Fields', icon: Settings2 },
      { to: '/admin/audit-log',     label: 'Audit Log',     icon: ScrollText, require: ['user:read', 'user:write', 'apikey:read', 'apikey:write'] },
    ],
  },
  {
    heading: 'Settings',
    items: [
      { to: '/licensing',         label: 'Licensing',       icon: BadgeCheck },
      { to: '/settings/2fa',      label: '2FA',             icon: ShieldCheck },
      { to: '/settings/password', label: 'Change Password', icon: KeyRound },
    ],
  },
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'heading' in entry;
}

const STORAGE_KEY = 'vairiot-nav-collapsed';

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function AppShell() {
  const { user, logout } = useAuthStore();
  const { currencyCode, setCurrencyPersist } = useCurrencyStore();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const location = useLocation();

  // Mark this browser as a "connected" device for the duration of the session.
  useDeviceHeartbeat();

  const toggleGroup = useCallback((heading: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [heading]: !prev[heading] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Auto-expand group containing the active route
  useEffect(() => {
    for (const entry of nav) {
      if (isGroup(entry) && entry.items.some(i => location.pathname.startsWith(i.to))) {
        if (collapsed[entry.heading]) {
          setCollapsed(prev => {
            const next = { ...prev, [entry.heading]: false };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        }
        break;
      }
    }
  }, [location.pathname]);

  const isItemVisible = (item: NavItem) =>
    !item.require || hasAnyPermission(user, ...item.require);

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}
        className={({ isActive }) => clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-v-violet text-white'
            : 'text-gray-400 hover:bg-white/10 hover:text-white',
        )}>
        <Icon size={18} />
        {item.label}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-v-charcoal transform transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
      )}>
        {/* Logo band — gradient */}
        <div className="h-16 flex items-center px-4 bg-gradient-to-r from-v-pink via-v-mauve to-v-violet">
          <span className="text-white font-bold text-xl tracking-wide font-sans">VAIRIOT</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map(entry => {
            if (!isGroup(entry)) {
              return isItemVisible(entry) ? renderLink(entry) : null;
            }

            const visibleItems = entry.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;

            const isCollapsed = collapsed[entry.heading] ?? false;
            const hasActiveChild = visibleItems.some(i => location.pathname.startsWith(i.to));

            return (
              <div key={entry.heading} className="pt-2">
                <button
                  onClick={() => toggleGroup(entry.heading)}
                  className={clsx(
                    'flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors',
                    hasActiveChild ? 'text-v-pink' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  {entry.heading}
                  <ChevronDown size={14} className={clsx(
                    'transition-transform duration-200',
                    isCollapsed && '-rotate-90',
                  )} />
                </button>
                <div className={clsx(
                  'overflow-hidden transition-all duration-200',
                  isCollapsed ? 'max-h-0 opacity-0' : 'max-h-96 opacity-100',
                )}>
                  <div className="mt-1 space-y-0.5">
                    {visibleItems.map(renderLink)}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Currency + User + logout */}
        <div className="px-3 py-4 border-t border-white/10 space-y-2">
          <div className="px-3">
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Currency</label>
            <select
              value={currencyCode}
              onChange={e => { void setCurrencyPersist(e.target.value); }}
              className="w-full text-xs rounded-lg border border-white/10 bg-white/5 text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-v-pink appearance-none cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code} className="bg-v-charcoal text-gray-300">
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 px-3 truncate">{user?.email}</p>
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
            {user?.tenantName && (
              <>
                <span className="text-sm text-gray-300">—</span>
                <span className="text-sm font-bold text-v-charcoal">{user.tenantName}</span>
              </>
            )}
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
