import { Request, Response, NextFunction } from 'express';

import { NotFoundError } from '../lib/errors';
import { errorHandler, asyncHandler } from '../middleware/error-handler';

jest.mock('../lib/logger', () => ({ logger: { error: jest.fn() } }));

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
}

describe('errorHandler', () => {
  it('returns AppError status and code', () => {
    const res = mockRes();
    errorHandler(new NotFoundError('Asset not found'), {} as Request, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Asset not found', code: 'NOT_FOUND' });
  });

  it('returns 500 for unknown errors', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {} as Request, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

describe('asyncHandler', () => {
  it('calls next on rejection', async () => {
    const err = new Error('async fail');
    const handler = asyncHandler(async () => { throw err; });
    const next = jest.fn() as NextFunction;
    await handler({} as Request, mockRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next on success', async () => {
    const handler = asyncHandler(async (_req, res) => { res.json({ ok: true }); });
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    await handler({} as Request, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
