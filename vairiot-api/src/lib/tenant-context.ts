import { AsyncLocalStorage } from 'node:async_hooks';

// The tenant a request acts for, for row-level security (decision D5, stage
// 1.19). Set once per authenticated request; read when a database connection
// is checked out (lib/rls-pool.ts). Outside a request there is none, and the
// policies let the query through (workers, seeds, migrations).
const store = new AsyncLocalStorage<{ tenantId: string | null }>();

/** Runs `fn` (e.g. the rest of an Express chain) for a tenant. Await any query inside `fn`. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return store.run({ tenantId }, fn);
}

/**
 * For the few reads that must cross tenants inside a request, such as the
 * asset count of a whole tenant family against its licence. Use sparingly.
 */
export function withoutTenantScope<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  // Await inside the scope: Prisma queries are lazy and run when awaited, so
  // returning the query unawaited would run it under the caller's scope.
  return store.run({ tenantId: null }, async () => await fn());
}

export function currentTenantId(): string | null {
  return store.getStore()?.tenantId ?? null;
}
