import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore, hasAnyPermission } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage }       from '@/pages/auth/LoginPage';
import { DashboardPage }   from '@/pages/dashboard/DashboardPage';
import { AssetsPage }      from '@/pages/assets/AssetsPage';
import { AssetDetailPage }  from '@/pages/assets/AssetDetailPage';
import { NewAssetPage }      from '@/pages/assets/NewAssetPage';
import { EditAssetPage }     from '@/pages/assets/EditAssetPage';
import { CategoriesPage }    from '@/pages/categories/CategoriesPage';
import { SitesPage }         from '@/pages/sites/SitesPage';
import { AuditsPage }        from '@/pages/audits/AuditsPage';
import { AuditRunPage }      from '@/pages/audits/AuditRunPage';
import { CheckoutsPage }     from '@/pages/checkouts/CheckoutsPage';
import { UsersPage }         from '@/pages/admin/UsersPage';
import { ApiKeysPage }       from '@/pages/admin/ApiKeysPage';
import { AuditLogPage }      from '@/pages/admin/AuditLogPage';
import { MaintenancePage }    from '@/pages/maintenance/MaintenancePage';
import { ExceptionsPage }     from '@/pages/exceptions/ExceptionsPage';
import { ReportsPage }        from '@/pages/reports/ReportsPage';
import { DepreciationPage }   from '@/pages/reports/DepreciationPage';
import { FixedAssetsPage }    from '@/pages/reports/FixedAssetsPage';
import { DisposalsPage }      from '@/pages/reports/DisposalsPage';
import { AgingPage }          from '@/pages/reports/AgingPage';
import { MaintenanceCostsPage } from '@/pages/reports/MaintenanceCostsPage';
import { AlertsPage }         from '@/pages/alerts/AlertsPage';
import { WebhooksPage }       from '@/pages/admin/WebhooksPage';
import { ImportPage }         from '@/pages/import/ImportPage';
import { LabelsPage }         from '@/pages/labels/LabelsPage';
import { CustomFieldsPage }   from '@/pages/admin/CustomFieldsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
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
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
            <Route path="admin/users"    element={<RequirePermission perms={['user:read', 'user:write']}><UsersPage /></RequirePermission>} />
            <Route path="admin/api-keys" element={<RequirePermission perms={['apikey:read', 'apikey:write']}><ApiKeysPage /></RequirePermission>} />
            <Route path="admin/webhooks" element={<RequirePermission perms={['apikey:write']}><WebhooksPage /></RequirePermission>} />
            <Route path="admin/custom-fields" element={<RequirePermission perms={['asset:write']}><CustomFieldsPage /></RequirePermission>} />
            <Route path="admin/audit-log" element={<RequirePermission perms={['user:read', 'user:write', 'apikey:read', 'apikey:write']}><AuditLogPage /></RequirePermission>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
