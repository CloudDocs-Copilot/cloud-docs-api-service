import type { Request, Response, NextFunction } from 'express';
import HttpError from '../../../src/models/error.model';
import { requireAdmin } from '../../../src/middlewares/role.middleware';

describe('requireAdmin middleware', (): void => {
  it('returns 403 when no user present', (): void => {
    const req = {} as Partial<Request>;
    const res = {} as Partial<Response>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    requireAdmin(req as Request, res as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
  });

  it('returns 403 when user is not admin', (): void => {
    const req = { user: { role: 'member' } } as Partial<Request>;
    const res = {} as Partial<Response>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    requireAdmin(req as Request, res as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
  });

  it('calls next without error when user is admin', (): void => {
    const req = { user: { role: 'admin' } } as Partial<Request>;
    const res = {} as Partial<Response>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    requireAdmin(req as Request, res as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });
});
