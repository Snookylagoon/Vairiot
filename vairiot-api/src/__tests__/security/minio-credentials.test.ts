import { assertScopedMinioCredentials } from '../../lib/minio';

// KFR-042: production ran on the MinIO root credentials with only a warning
// whenever MINIO_ACCESS_KEY was missing. It must now refuse to start.
describe('assertScopedMinioCredentials', () => {
  it('refuses root credentials in production', () => {
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'production' })).toThrow(/ROOT credentials/);
  });

  it('accepts the scoped app user in production', () => {
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'production', MINIO_CREDENTIALS: 'scoped' })).not.toThrow();
  });

  it('allows root only with the explicit override', () => {
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'production', MINIO_ALLOW_ROOT: 'true' })).not.toThrow();
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'production', MINIO_ALLOW_ROOT: '1' })).toThrow();
  });

  it('does not apply outside production', () => {
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertScopedMinioCredentials({ NODE_ENV: 'test' })).not.toThrow();
  });
});
