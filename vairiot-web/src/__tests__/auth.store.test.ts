import { hasAnyPermission } from '../stores/auth.store';

describe('hasAnyPermission', () => {
  it('returns false for null user', () => {
    expect(hasAnyPermission(null, 'asset:read')).toBe(false);
  });

  it('returns false when user has none of the required permissions', () => {
    const user = { userId: '1', email: 'a@b.c', tenantId: 't1', roles: [], permissions: ['site:write'] };
    expect(hasAnyPermission(user, 'asset:read', 'asset:write')).toBe(false);
  });

  it('returns true when user has at least one matching permission', () => {
    const user = { userId: '1', email: 'a@b.c', tenantId: 't1', roles: [], permissions: ['asset:read'] };
    expect(hasAnyPermission(user, 'asset:read', 'asset:write')).toBe(true);
  });

  it('returns true when user has all required permissions', () => {
    const user = { userId: '1', email: 'a@b.c', tenantId: 't1', roles: [], permissions: ['asset:read', 'asset:write'] };
    expect(hasAnyPermission(user, 'asset:read', 'asset:write')).toBe(true);
  });
});
