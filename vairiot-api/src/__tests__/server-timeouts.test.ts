import { createServer } from 'node:http';
import net from 'node:net';

import { applyServerTimeouts, SERVER_TIMEOUTS } from '../lib/server-timeouts';

describe('server timeouts (COM-3)', () => {
  it('sets the header and request limits', () => {
    const server = applyServerTimeouts(createServer());
    expect(server.headersTimeout).toBe(30_000);
    expect(server.requestTimeout).toBe(330_000);
    // Request limit above nginx's longest proxy timeout (300 s on the admin API).
    expect(SERVER_TIMEOUTS.requestTimeout).toBeGreaterThan(300_000);
  });

  it('drops a client that never finishes its headers', async () => {
    const server = createServer((_req, res) => res.end('ok'));
    applyServerTimeouts(server);
    // Shrunk for the test; Node checks timeouts every connectionsCheckingInterval.
    server.headersTimeout = 300;
    server.requestTimeout = 300;
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as net.AddressInfo;
    try {
      const reply = await new Promise<string>((resolve) => {
        const socket = net.connect(port, '127.0.0.1', () => socket.write('GET / HTTP/1.1\r\nHost: x\r\n')); // never ends headers
        let data = '';
        socket.on('data', (d) => { data += d; });
        socket.on('close', () => resolve(data));
      });
      expect(reply).toMatch(/^HTTP\/1\.1 408/);
    } finally {
      server.close();
    }
  }, 40_000);
});
