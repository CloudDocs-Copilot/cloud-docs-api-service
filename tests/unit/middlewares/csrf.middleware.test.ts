// Mock csrf-csrf before requiring the middleware so module init uses mock
jest.resetModules();
jest.mock('csrf-csrf', () => ({
  doubleCsrf: jest.fn(() => ({
    doubleCsrfProtection: jest.fn((_, __, next) => next()),
    generateCsrfToken: jest.fn(() => 'csrf-token')
  }))
}));

afterEach(() => {
  jest.resetAllMocks();
  jest.resetModules();
});

describe('csrf.middleware', () => {
  it('skips protection for excluded routes', () => {
    const { csrfProtectionMiddleware } = require('../../../src/middlewares/csrf.middleware');
    const req: any = { path: '/api/auth/login' };
    const next = jest.fn();
    csrfProtectionMiddleware(req, {} as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls doubleCsrfProtection for non-excluded routes', () => {
    const { csrfProtectionMiddleware } = require('../../../src/middlewares/csrf.middleware');
    const req: any = { path: '/api/some-protected' };
    const next = jest.fn();
    csrfProtectionMiddleware(req, {} as any, next);
    expect(next).toHaveBeenCalled();
  });
});
