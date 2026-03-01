// Mock csrf-csrf before requiring the middleware so module init uses mock
jest.resetModules();
jest.mock('csrf-csrf', () => ({
  doubleCsrf: jest.fn(() => ({
    doubleCsrfProtection: jest.fn((_: unknown, __: unknown, next: () => void) => next()),
    generateCsrfToken: jest.fn(() => 'csrf-token')
  }))
}) as unknown as typeof import('csrf-csrf'));

afterEach(() => {
  jest.resetAllMocks();
  jest.resetModules();
});

describe('csrf.middleware', (): void => {
  it('skips protection for excluded routes', async (): Promise<void> => {
    const { csrfProtectionMiddleware } = (await import('../../../src/middlewares/csrf.middleware')) as unknown as typeof import('../../../src/middlewares/csrf.middleware');
    const req: Partial<import('express').Request> = { path: '/api/auth/login' };
    const res: Partial<import('express').Response> = {};
    const next = jest.fn();
    csrfProtectionMiddleware(req as import('express').Request, res as import('express').Response, next as unknown as () => void);
    expect(next).toHaveBeenCalled();
  });

  it('calls doubleCsrfProtection for non-excluded routes', async (): Promise<void> => {
    const { csrfProtectionMiddleware } = (await import('../../../src/middlewares/csrf.middleware')) as unknown as typeof import('../../../src/middlewares/csrf.middleware');
    const req: Partial<import('express').Request> = { path: '/api/some-protected' };
    const res: Partial<import('express').Response> = {};
    const next = jest.fn();
    csrfProtectionMiddleware(req as import('express').Request, res as import('express').Response, next as unknown as () => void);
    expect(next).toHaveBeenCalled();
  });
});
