export function generateSecret(): string {
  return 'MOCK_SECRET_BASE32_VALUE';
}

export function generateURI(_opts: { issuer: string; label: string; secret: string }): string {
  return 'otpauth://totp/Vairiot:test@test.com?secret=MOCK&issuer=Vairiot';
}

export function verifySync({ token }: { token: string; secret: string }): boolean {
  return token === '123456';
}

export class TOTP {}
