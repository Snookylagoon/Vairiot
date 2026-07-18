import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AdminShell } from '@/components/layout/AdminShell';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const LoginPage       = lazy(() => import('./pages/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage   = lazy(() => import('./pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const TenantsPage     = lazy(() => import('./pages/tenants/TenantsPage').then(m => ({ default: m.TenantsPage })));
const TenantDetailPage = lazy(() => import('./pages/tenants/TenantDetailPage').then(m => ({ default: m.TenantDetailPage })));
const TenantOnboardingPage = lazy(() => import('./pages/tenants/TenantOnboardingPage').then(m => ({ default: m.TenantOnboardingPage })));
const NewTenantWizardPage = lazy(() => import('./pages/tenants/NewTenantWizardPage').then(m => ({ default: m.NewTenantWizardPage })));
const LicencesPage    = lazy(() => import('./pages/licences/LicencesPage').then(m => ({ default: m.LicencesPage })));
const UsersPage       = lazy(() => import('./pages/users/UsersPage').then(m => ({ default: m.UsersPage })));
const UserDetailPage  = lazy(() => import('./pages/users/UserDetailPage').then(m => ({ default: m.UserDetailPage })));
const AuditLogPage    = lazy(() => import('./pages/audit-log/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const SmtpPage        = lazy(() => import('./pages/smtp/SmtpPage').then(m => ({ default: m.SmtpPage })));
const MobileReleasesPage = lazy(() => import('./pages/mobile-releases/MobileReleasesPage').then(m => ({ default: m.MobileReleasesPage })));
const IosReleasesPage = lazy(() => import('./pages/ios-releases/IosReleasesPage').then(m => ({ default: m.IosReleasesPage })));
const ChangePasswordPage = lazy(() => import('./pages/profile/ChangePasswordPage').then(m => ({ default: m.ChangePasswordPage })));

function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-v-violet border-t-transparent" />
    </div>
  );
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
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

              <Route path="/" element={<RequireAdmin><AdminShell /></RequireAdmin>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="tenants/new" element={<NewTenantWizardPage />} />
                <Route path="tenants/:id" element={<TenantDetailPage />} />
                <Route path="tenants/:id/onboarding" element={<TenantOnboardingPage />} />
                <Route path="licences" element={<LicencesPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="audit-log" element={<AuditLogPage />} />
                <Route path="smtp" element={<SmtpPage />} />
                <Route path="mobile-releases" element={<MobileReleasesPage />} />
                <Route path="ios-releases" element={<IosReleasesPage />} />
                <Route path="profile/password" element={<ChangePasswordPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
