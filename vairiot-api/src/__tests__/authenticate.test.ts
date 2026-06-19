import { Request, Response, NextFunction } from 'express';
import { requireAnyPermission } from '../middleware/authenticate';

function mockReqRes(user?: { permissions: string[] }) {
  const req = { user } as unknown as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('requireAnyPermission', () => {
  it('returns 401 when no user', () => {
    const { req, res, next } = mockReqRes();
    requireAnyPermission('asset:read')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks all permissions', () => {
    const { req, res, next } = mockReqRes({ permissions: ['site:write'] });
    requireAnyPermission('asset:read', 'asset:write')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user has at least one permission', () => {
    const { req, res, next } = mockReqRes({ permissions: ['asset:read', 'site:write'] });
    requireAnyPermission('asset:read', 'user:write')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
