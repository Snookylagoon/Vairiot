import pg from 'pg';

import { currentTenantId } from './tenant-context';

// Row-level security hook (decision D5, stage 1.19). Every connection Prisma
// checks out is set for the current request: inside a tenant-scoped request it
// switches to the unprivileged role vairiot_rls (superusers bypass RLS even
// with FORCE) and sets app.tenant_id; outside one it resets both. pg-pool's
// query() and Prisma's transactions both come through connect().

export const RLS_ROLE = 'vairiot_rls';
type Tagged = pg.PoolClient & { rlsTenant?: string };

async function prepare(client: Tagged, tenantId: string | null): Promise<void> {
  const want = tenantId ?? '';
  if (client.rlsTenant === want) return;
  if (tenantId) {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    await client.query(`SET ROLE ${RLS_ROLE}`);
  } else {
    await client.query("SELECT set_config('app.tenant_id', '', false)");
    await client.query('RESET ROLE');
  }
  client.rlsTenant = want;
}

export class RlsPool extends pg.Pool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(cb?: any): any {
    const tenantId = currentTenantId();
    const ready = super.connect().then(async (client: Tagged) => {
      try {
        await prepare(client, tenantId);
        return client;
      } catch (e) {
        client.release(e as Error);
        throw e;
      }
    });
    if (typeof cb === 'function') {
      ready.then((client) => cb(undefined, client, (err?: Error) => client.release(err)), (err) => cb(err));
      return undefined;
    }
    return ready;
  }
}
