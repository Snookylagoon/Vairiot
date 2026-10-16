import { prisma } from './prisma';
import { RLS_ROLE } from './rls-pool';

/**
 * Refuse to start when tenant requests could not switch to the row-level-
 * security role (D5, stage 1.19): every tenant query would otherwise fail.
 * Roles are not in a database dump, so a restore onto a new server is the
 * usual cause (infra/restore.sh creates it).
 */
export async function assertRlsRole(): Promise<void> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${RLS_ROLE})
       AND pg_has_role(current_user, (SELECT oid FROM pg_roles WHERE rolname = ${RLS_ROLE}), 'MEMBER') AS ok`;
  if (!rows[0]?.ok) {
    throw new Error(`Database role ${RLS_ROLE} is missing or not granted to the API's login role; run the migrations or infra/restore.sh`);
  }
}
