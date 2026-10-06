// Optional browser error tracking (Sentry, or a self-hosted GlitchTip, which
// speaks the same protocol). Off unless VITE_SENTRY_DSN is set at build time.
// The SDK is loaded with a dynamic import, so it adds nothing to the bundle a
// user downloads while monitoring is off.
export function initMonitoring(dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN): boolean {
  if (!dsn) return false;
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // Errors only: no performance tracing or session replay, so no page
        // content leaves the browser beyond the error report itself. (SDK v11
        // sends no personal data such as IP addresses by default.)
        tracesSampleRate: 0,
      });
    })
    .catch(() => {
      // Monitoring must never break the app (ad blockers block Sentry).
    });
  return true;
}
