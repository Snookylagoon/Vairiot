import { AssetStatus, AssetCondition, DepreciationMethod, DisposalMethod } from '../constants/asset.constants';
import { Permission, ALL_PERMISSIONS } from '../constants/permissions.constants';
import { loginSchema, refreshSchema } from '../schemas/auth.schemas';

describe('asset constants', () => {
  it('AssetStatus contains expected values', () => {
    expect(AssetStatus.Active).toBe('active');
    expect(AssetStatus.Disposed).toBe('disposed');
    expect(Object.values(AssetStatus)).toHaveLength(5);
  });

  it('AssetCondition contains expected values', () => {
    expect(AssetCondition.New).toBe('new');
    expect(Object.values(AssetCondition)).toHaveLength(5);
  });

  it('DepreciationMethod has straight_line', () => {
    expect(DepreciationMethod.StraightLine).toBe('straight_line');
  });

  it('DisposalMethod contains expected values', () => {
    expect(DisposalMethod.Sale).toBe('sale');
    expect(Object.values(DisposalMethod)).toHaveLength(6);
  });
});

describe('permissions constants', () => {
  it('Permission object matches ALL_PERMISSIONS array', () => {
    expect(ALL_PERMISSIONS).toEqual(Object.values(Permission));
  });

  it('ALL_PERMISSIONS has no duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('all permissions follow resource:action pattern', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(p).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });
});

describe('auth schemas', () => {
  it('loginSchema rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'bad', password: '12345678', tenantId: 't1' });
    expect(result.success).toBe(false);
  });

  it('loginSchema rejects short password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.c', password: '1234567', tenantId: 't1' });
    expect(result.success).toBe(false);
  });

  it('loginSchema accepts valid input', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '12345678', tenantId: 't1' });
    expect(result.success).toBe(true);
  });

  it('refreshSchema rejects empty token', () => {
    const result = refreshSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});
