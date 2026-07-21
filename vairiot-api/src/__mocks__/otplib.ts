export function generateSecret(): string {
  return 'MOCK_SECRET_BASE32_VALUE';
}

export function generateURI(_opts: { issuer: string; label: string; secret: string }): string {
  return 'otpauth://totp/Vairiot:test@test.com?secret=MOCK&issuer=Vairiot';
}

// Mirror the real otplib API: verifySync returns a VerifyResult OBJECT (always
// truthy — callers must check .valid) and THROWS on tokens that aren't 6 digits.
// The previous boolean-returning mock hid a real 2FA bypass from the tests.
export function verifySync({ token }: { token: string; secret: string }): { valid: boolean } {
  if (!/^\d{6}$/.test(token)) {
    throw new Error(`Token must be 6 digits, got ${token.length}`);
  }
  return { valid: token === '123456' };
}

export class TOTP {}
