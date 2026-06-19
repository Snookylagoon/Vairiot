/**
 * Build a Prisma `orderBy` object from request query params.
 *
 * The whitelist exists because `sortBy` comes from a user-controlled query
 * string and is fed straight to Prisma — we must never accept an arbitrary
 * field name.
 *
 * Keys may be nested with dot notation (e.g. `tenant.name`), which maps to
 * Prisma's nested orderBy shape.
 */
export function buildOrderBy<T extends Record<string, unknown>>(
  sortBy: string | undefined,
  sortOrder: string | undefined,
  whitelist: readonly string[],
  fallback: T,
): T | Record<string, unknown> {
  if (!sortBy || !whitelist.includes(sortBy)) return fallback;
  const order = sortOrder === 'desc' ? 'desc' : 'asc';
  if (sortBy.includes('.')) {
    const [head, ...rest] = sortBy.split('.');
    let inner: Record<string, unknown> = { [rest[rest.length - 1]]: order };
    for (let i = rest.length - 2; i >= 0; i--) inner = { [rest[i]]: inner };
    return { [head]: inner };
  }
  return { [sortBy]: order };
}
