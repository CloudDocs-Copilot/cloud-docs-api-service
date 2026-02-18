import HttpError from '../../../src/models/error.model';
import { requireAdmin } from '../../../src/middlewares/role.middleware';

describe('requireAdmin middleware', () => {
  it('returns 403 when no user present', () => {
    const req: any = {};
    const res: any = {};
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
  });

  it('returns 403 when user is not admin', () => {
    const req: any = { user: { role: 'member' } };
    const res: any = {};
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
  });

  it('calls next without error when user is admin', () => {
    const req: any = { user: { role: 'admin' } };
    const res: any = {};
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
