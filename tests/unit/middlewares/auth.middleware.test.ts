// Extend Express Request type to include 'user'
import { Request } from 'express';
describe('authenticateToken middleware', (): void => {
  const baseReq = (): Partial<import('express').Request> => ({ headers: {}, cookies: {} as unknown as Record<string, string> });

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('returns 401 when token is missing', async (): Promise<void> => {
    jest.resetModules();
    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as unknown as typeof import('../../../src/middlewares/auth.middleware');

    const req = baseReq();
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Access token required/);
  });

  it('handles invalid token (JsonWebTokenError)', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => {
        throw Object.assign(new Error('jwt error'), { name: 'JsonWebTokenError' });
      })
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as unknown as typeof import('../../../src/middlewares/auth.middleware');

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 'bad';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Invalid token/);
  });

  it('handles expired token (TokenExpiredError)', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => {
        throw Object.assign(new Error('expired'), { name: 'TokenExpiredError' });
      })
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as unknown as typeof import('../../../src/middlewares/auth.middleware');

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 'expired';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Token expired/);
  });

  it('returns 401 when user not found', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => ({ id: 'u1' }))
    }));
    jest.mock('../../../src/models/user.model', () => ({
      findById: jest.fn(() => Promise.resolve(null))
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as {
      authenticateToken: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>;
    };
    const User = jest.requireMock('../../../src/models/user.model') as { findById: jest.Mock };

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 't';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/User no longer exists/);
  });

  it('returns 401 when user is deactivated', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => ({ id: 'u1' }))
    }));
    jest.mock('../../../src/models/user.model', () => ({
      findById: jest.fn(() => Promise.resolve({ _id: 'u1', active: false }))
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as {
      authenticateToken: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>;
    };

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 't';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/User account deactivated/);
  });

  it('invalidates token on email mismatch', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => ({ id: 'u1', email: 'a@x' }))
    }));
    jest.mock('../../../src/models/user.model', () => ({
      findById: jest.fn(() => Promise.resolve({ _id: 'u1', email: 'b@x', active: true }))
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as {
      authenticateToken: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>;
    };

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 't';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/email change/);
  });

  it('invalidates token on tokenVersion mismatch', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => ({ id: 'u1', tokenVersion: 2 }))
    }));
    jest.mock('../../../src/models/user.model', () => ({
      findById: jest.fn(() =>
        Promise.resolve({ _id: 'u1', email: 'a@x', active: true, tokenVersion: 1 })
      )
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as {
      authenticateToken: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>;
    };

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 't';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0] as unknown as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/password change/);
  });

  it('succeeds and sets req.user and refreshes cookie when token valid', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({
      verifyToken: jest.fn(() => ({ id: 'u1', email: 'a@x', tokenVersion: 1 }))
    }));
    jest.mock('../../../src/models/user.model', () => ({
      findById: jest.fn(() =>
        Promise.resolve({
          _id: 'u1',
          email: 'a@x',
          active: true,
          role: 'member',
          name: 'X',
          tokenVersion: 1
        })
      )
    }));

    const { authenticateToken } = (await import('../../../src/middlewares/auth.middleware')) as unknown as typeof import('../../../src/middlewares/auth.middleware');

    const req = baseReq();
    (req.cookies as Record<string, string>).token = 't';
    const res: Partial<import('express').Response> = { cookie: jest.fn() as unknown as import('express').Response['cookie'] };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    await authenticateToken(req as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(res.cookie).toHaveBeenCalled();
    
    interface TestRequest extends Request {
      user?: { email: string; role: string };
    }
    
        const user = (req as TestRequest).user;
        expect(user).toBeDefined();
        expect(user!.email).toBe('a@x');
        expect(user!.role).toBe('member');
  });
});
