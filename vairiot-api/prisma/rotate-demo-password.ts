// Rotates the demo accounts away from the leaked demo password (KFR-037).
//
//   OLD_DEMO_PASSWORD='<leaked value>' NEW_DEMO_PASSWORD='<new value>' \
//     npm run rotate:demo-password --workspace=vairiot-api
//
// Only accounts on the seed list whose password still IS the leaked value are
// changed, so a real account that shares a seed email (superadmin@vairiot.com
// on a live server, say) and already has its own password is left alone.
// Neither password is printed. Access tokens already issued stay valid until
// they expire; refresh tokens are stateless, so sign the demo users out by
// rotating JWT_REFRESH_SECRET if the old password may have been used.
import bcrypt from 'bcryptjs';

import { prisma } from '../src/lib/prisma';

import { SEED_USERS, requirePassword } from './demo-accounts';

export async function rotateDemoPasswords(oldPassword: string, newPassword: string): Promise<{ checked: number; rotated: string[] }> {
  if (oldPassword === newPassword) throw new Error('The new password must differ from the old one');
  const users = await prisma.user.findMany({
    where: { email: { in: SEED_USERS.map((u) => u.email) } },
    select: { id: true, email: true, tenantId: true, passwordHash: true },
  });
  const newHash = await bcrypt.hash(newPassword, 12);
  const rotated: string[] = [];
  for (const u of users) {
    if (!u.passwordHash || !(await bcrypt.compare(oldPassword, u.passwordHash))) continue;
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: newHash } });
    rotated.push(`${u.email} (${u.tenantId})`);
  }
  return { checked: users.length, rotated };
}

if (require.main === module) {
  rotateDemoPasswords(requirePassword('OLD_DEMO_PASSWORD'), requirePassword('NEW_DEMO_PASSWORD'))
    .then(({ checked, rotated }) => {
      console.log(`Checked ${checked} seed account(s); rotated ${rotated.length}:`);
      for (const r of rotated) console.log(`  ${r}`);
    })
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
