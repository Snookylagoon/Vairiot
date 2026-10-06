// APP_ENCRYPTION_KEY must be at least 32 characters (audit SEC-M6, KFR-035).
describe('APP_ENCRYPTION_KEY check', () => {
  const original = process.env.APP_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = original;
    jest.resetModules();
  });

  function load(key: string | undefined) {
    if (key === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = key;
    let mod!: typeof import('../lib/crypto');
    jest.isolateModules(() => {
      mod = require('../lib/crypto');
    });
    return mod;
  }

  it('refuses a missing key', () => {
    expect(() => load(undefined).assertEncryptionKey()).toThrow(/>=32/);
  });

  it('refuses a 31-character key', () => {
    expect(() => load('a'.repeat(31)).assertEncryptionKey()).toThrow(/>=32/);
  });

  it('accepts a 32-character key and round-trips a secret', () => {
    const crypto = load('b'.repeat(32));
    expect(() => crypto.assertEncryptionKey()).not.toThrow();
    expect(crypto.decryptSecret(crypto.encryptSecret('smtp-pass'))).toBe('smtp-pass');
  });
});
