import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore, hasAnyPermission } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/auth/LoginPage';
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage').then(m => ({ default: m.AcceptInvitePage })));

const DashboardPage       = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AssetsPage           = lazy(() => import('@/pages/assets/AssetsPage').then(m => ({ default: m.AssetsPage })));
const AssetDetailPage      = lazy(() => import('@/pages/assets/AssetDetailPage').then(m => ({ default: m.AssetDetailPage })));
const NewAssetPage         = lazy(() => import('@/pages/assets/NewAssetPage').then(m => ({ default: m.NewAssetPage })));
const EditAssetPage        = lazy(() => import('@/pages/assets/EditAssetPage').then(m => ({ default: m.EditAssetPage })));
const CategoriesPage       = lazy(() => import('@/pages/categories/CategoriesPage').then(m => ({ default: m.CategoriesPage })));
const SitesPage            = lazy(() => import('@/pages/sites/SitesPage').then(m => ({ default: m.SitesPage })));
const AuditsPage           = lazy(() => import('@/pages/audits/AuditsPage').then(m => ({ default: m.AuditsPage })));
const AuditRunPage         = lazy(() => import('@/pages/audits/AuditRunPage').then(m => ({ default: m.AuditRunPage })));
const CheckoutsPage        = lazy(() => import('@/pages/checkouts/CheckoutsPage').then(m => ({ default: m.CheckoutsPage })));
const MaintenancePage      = lazy(() => import('@/pages/maintenance/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const ExceptionsPage       = lazy(() => import('@/pages/exceptions/ExceptionsPage').then(m => ({ default: m.ExceptionsPage })));
const ReportsPage          = lazy(() => import('@/pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const DepreciationPage     = lazy(() => import('@/pages/reports/DepreciationPage').then(m => ({ default: m.DepreciationPage })));
const FixedAssetsPage      = lazy(() => import('@/pages/reports/FixedAssetsPage').then(m => ({ default: m.FixedAssetsPage })));
const DisposalsPage        = lazy(() => import('@/pages/reports/DisposalsPage').then(m => ({ default: m.DisposalsPage })));
const AgingPage            = lazy(() => import('@/pages/reports/AgingPage').then(m => ({ default: m.AgingPage })));
const MaintenanceCostsPage = lazy(() => import('@/pages/reports/MaintenanceCostsPage').then(m => ({ default: m.MaintenanceCostsPage })));
const AlertsPage           = lazy(() => import('@/pages/alerts/AlertsPage').then(m => ({ default: m.AlertsPage })));
const ImportPage           = lazy(() => import('@/pages/import/ImportPage').then(m => ({ default: m.ImportPage })));
const LabelsPage           = lazy(() => import('@/pages/labels/LabelsPage').then(m => ({ default: m.LabelsPage })));
const UsersPage            = lazy(() => import('@/pages/admin/UsersPage').then(m => ({ default: m.UsersPage })));
const ApiKeysPage          = lazy(() => import('@/pages/admin/ApiKeysPage').then(m => ({ default: m.ApiKeysPage })));
const AuditLogPage         = lazy(() => import('@/pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const WebhooksPage         = lazy(() => import('@/pages/admin/WebhooksPage').then(m => ({ default: m.WebhooksPage })));
const CustomFieldsPage     = lazy(() => import('@/pages/admin/CustomFieldsPage').then(m => ({ default: m.CustomFieldsPage })));
const OnboardingPage       = lazy(() => import('@/pages/onboarding/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const LicensingPage        = lazy(() => import('@/pages/licensing/LicensingPage').then(m => ({ default: m.LicensingPage })));
const TwoFactorPage        = lazy(() => import('@/pages/settings/TwoFactorPage').then(m => ({ default: m.TwoFactorPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const PageSpinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-v-pink border-t-transparent" />
  </div>
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingRequired } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-v-pink border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingRequired) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequireAuthOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-v-pink border-t-transparent" /></div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequirePermission({ perms, children }: { perms: string[]; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  return hasAnyPermission(user, ...perms) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" richColors closeButton />
      <BrowserRouter>
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/onboarding" element={<RequireAuthOnly><OnboardingPage /></RequireAuthOnly>} />
          <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="assets"       element={<AssetsPage />} />
            <Route path="assets/new"   element={<NewAssetPage />} />
            <Route path="assets/:id"   element={<AssetDetailPage />} />
            <Route path="assets/:id/edit" element={<EditAssetPage />} />
            <Route path="categories"   element={<CategoriesPage />} />
            <Route path="sites"        element={<SitesPage />} />
            <Route path="audits"       element={<AuditsPage />} />
            <Route path="audits/:id/run" element={<AuditRunPage />} />
            <Route path="checkouts"      element={<CheckoutsPage />} />
            <Route path="maintenance"    element={<MaintenancePage />} />
            <Route path="exceptions"     element={<ExceptionsPage />} />
            <Route path="reports"        element={<ReportsPage />} />
            <Route path="reports/depreciation" element={<DepreciationPage />} />
            <Route path="reports/fixed-assets" element={<FixedAssetsPage />} />
            <Route path="reports/disposals"    element={<DisposalsPage />} />
            <Route path="reports/aging"        element={<AgingPage />} />
            <Route path="reports/maintenance-costs" element={<MaintenanceCostsPage />} />
            <Route path="alerts"         element={<AlertsPage />} />
            <Route path="import"        element={<ImportPage />} />
            <Route path="labels"        element={<LabelsPage />} />
            <Route path="licensing"     element={<LicensingPage />} />
            <Route path="settings/2fa"  element={<TwoFactorPage />} />
            <Route path="admin/users"    element={<RequirePermission perms={['user:read', 'user:write']}><UsersPage /></RequirePermission>} />
            <Route path="admin/api-keys" element={<RequirePermission perms={['apikey:read', 'apikey:write']}><ApiKeysPage /></RequirePermission>} />
            <Route path="admin/webhooks" element={<RequirePermission perms={['apikey:write']}><WebhooksPage /></RequirePermission>} />
            <Route path="admin/custom-fields" element={<RequirePermission perms={['asset:write']}><CustomFieldsPage /></RequirePermission>} />
            <Route path="admin/audit-log" element={<RequirePermission perms={['user:read', 'user:write', 'apikey:read', 'apikey:write']}><AuditLogPage /></RequirePermission>} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
