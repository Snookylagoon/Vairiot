import type { Server } from 'node:net';

import express from 'express';
import request from 'supertest';

// Regression for the flaky "socket hang up" / wrong-server responses on macOS
// (see jest.setup.ts): the server supertest starts for `request(app)` must
// listen on the loopback address it connects to, never the wildcard address.
describe('supertest server binding', () => {
  it('listens on 127.0.0.1, not the wildcard address', async () => {
    const app = express();
    app.get('/where', (req, res) => {
      // The listening socket of the server supertest created for this request.
      const server = (req.socket as unknown as { server: Server }).server;
      res.json(server.address());
    });
    const r = await request(app).get('/where');
    expect(r.status).toBe(200);
    expect(r.body.address).toBe('127.0.0.1');
  });
});
