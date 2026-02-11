describe('authenticateToken middleware', () => {
  const baseReq = () => ({ headers: {}, cookies: {} as any });

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('returns 401 when token is missing', async () => {
    jest.resetModules();
    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Access token required/);
  });

  it('handles invalid token (JsonWebTokenError)', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => { throw Object.assign(new Error('jwt error'), { name: 'JsonWebTokenError' }); }) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 'bad';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Invalid token/);
  });

  it('handles expired token (TokenExpiredError)', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => { throw Object.assign(new Error('expired'), { name: 'TokenExpiredError' }); }) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 'expired';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/Token expired/);
  });

  it('returns 401 when user not found', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => ({ id: 'u1' })) }));
    jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn(() => Promise.resolve(null)) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');
    const User = require('../../../src/models/user.model');

    const req: any = baseReq();
    req.cookies.token = 't';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/User no longer exists/);
  });

  it('returns 401 when user is deactivated', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => ({ id: 'u1' })) }));
    jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn(() => Promise.resolve({ _id: 'u1', active: false })) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 't';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/User account deactivated/);
  });

  it('invalidates token on email mismatch', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => ({ id: 'u1', email: 'a@x' })) }));
    jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn(() => Promise.resolve({ _id: 'u1', email: 'b@x', active: true })) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 't';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/email change/);
  });

  it('invalidates token on tokenVersion mismatch', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => ({ id: 'u1', tokenVersion: 2 })) }));
    jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn(() => Promise.resolve({ _id: 'u1', email: 'a@x', active: true, tokenVersion: 1 })) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 't';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/password change/);
  });

  it('succeeds and sets req.user and refreshes cookie when token valid', async () => {
    jest.resetModules();
    jest.mock('../../../src/services/jwt.service', () => ({ verifyToken: jest.fn(() => ({ id: 'u1', email: 'a@x', tokenVersion: 1 })) }));
    jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn(() => Promise.resolve({ _id: 'u1', email: 'a@x', active: true, role: 'member', name: 'X', tokenVersion: 1 })) }));

    const { authenticateToken } = require('../../../src/middlewares/auth.middleware');

    const req: any = baseReq();
    req.cookies.token = 't';
    const res: any = { cookie: jest.fn() };
    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.cookie).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('a@x');
    expect(req.user.role).toBe('member');
  });
});
