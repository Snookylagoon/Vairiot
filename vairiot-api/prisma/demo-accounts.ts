// Demo accounts created by prisma/seed.ts, shared with rotate-demo-password.ts.
//
// The demo password used to be a constant in seed.ts, and the same value sat
// in vairiot-web/public/auto-login.html, which every deployment served to
// anyone. It is now read from SEED_DEMO_PASSWORD and never printed (KFR-037).

export const DEMO_PASSWORD_MIN_LENGTH = 12;

// One user per role — 11 users total + the original demo admin
export const SEED_USERS: { email: string; name: string; roleName: string }[] = [
  { email: 'superadmin@vairiot.com',  name: 'Platform Super Admin',   roleName: 'Platform Super Admin' },
  { email: 'licensing@vairiot.com',   name: 'Licensing Authority',    roleName: 'Licensing Authority' },
  { email: 'admin@demo.vairiot.com',  name: 'Company Administrator',  roleName: 'Company Admin' },
  { email: 'assets@demo.vairiot.com', name: 'Asset Manager',          roleName: 'Asset Manager' },
  { email: 'maint-mgr@demo.vairiot.com', name: 'Maintenance Manager', roleName: 'Maintenance Manager' },
  { email: 'tech@demo.vairiot.com',   name: 'Maintenance Technician', roleName: 'Maintenance Technician' },
  { email: 'collector@demo.vairiot.com', name: 'Data Collector',      roleName: 'Data Collector' },
  { email: 'auditor@demo.vairiot.com', name: 'Auditor',               roleName: 'Auditor' },
  { email: 'viewer@demo.vairiot.com',  name: 'Viewer',                roleName: 'Viewer' },
  { email: 'stakeholder@client.com',   name: 'Client Stakeholder',    roleName: 'Client Stakeholder' },
  { email: 'authority@client.com',     name: 'Client Authority',      roleName: 'Client Authority' },
];

/** Reads a password from the environment, refusing a missing or short one. */
export function requirePassword(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name] ?? '';
  if (value.length < DEMO_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `${name} must be set to at least ${DEMO_PASSWORD_MIN_LENGTH} characters. ` +
      'Generate one with: openssl rand -base64 18',
    );
  }
  return value;
}
