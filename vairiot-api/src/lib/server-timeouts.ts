import type { Server } from 'node:http';

/**
 * HTTP server timeouts (audit COM-3). In production nginx sits in front and
 * buffers request bodies, so these mainly guard a directly exposed API
 * (standalone installs without the bundled nginx, local runs):
 *   - headersTimeout: a client must send its request headers within 30 s, so
 *     slow-header connections can't be held open to exhaust the server;
 *   - requestTimeout: a whole request (headers + body) within 330 s, enough
 *     for a 150 MB app release on a slow line, and just above nginx's longest
 *     proxy timeout (300 s, admin) so nginx answers first.
 * keepAliveTimeout keeps Node's default (5 s): nginx doesn't reuse upstream
 * connections.
 */
export const SERVER_TIMEOUTS = {
  headersTimeout: 30_000,
  requestTimeout: 330_000,
} as const;

export function applyServerTimeouts(server: Server): Server {
  server.headersTimeout = SERVER_TIMEOUTS.headersTimeout;
  server.requestTimeout = SERVER_TIMEOUTS.requestTimeout;
  return server;
}
