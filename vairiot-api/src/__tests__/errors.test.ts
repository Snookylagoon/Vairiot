import { AppError, NotFoundError, ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../lib/errors';

describe('AppError hierarchy', () => {
  it('AppError stores statusCode, message, and code', () => {
    const err = new AppError(418, 'teapot', 'I_AM_A_TEAPOT');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe('teapot');
    expect(err.code).toBe('I_AM_A_TEAPOT');
    expect(err.name).toBe('AppError');
  });

  it.each([
    { Ctor: NotFoundError, status: 404, code: 'NOT_FOUND', defaultMsg: 'Not found' },
    { Ctor: ForbiddenError, status: 403, code: 'FORBIDDEN', defaultMsg: 'Insufficient permissions' },
    { Ctor: UnauthorizedError, status: 401, code: 'UNAUTHORIZED', defaultMsg: 'Unauthorized' },
  ])('$Ctor.name defaults', ({ Ctor, status, code, defaultMsg }) => {
    const err = new Ctor();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err.message).toBe(defaultMsg);
  });

  it('ConflictError accepts custom code', () => {
    const err = new ConflictError('Already exists', 'DUPLICATE');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('DUPLICATE');
  });

  it('ValidationError sets 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
