jest.resetModules();
import type { CorsOptions } from 'cors';

let getCorsOptions: () => CorsOptions;

beforeEach(async () => {
  jest.resetModules();
  const mod = (await import('../../../src/configurations/cors-config')) as unknown;
  getCorsOptions = ((mod as { default?: () => CorsOptions }).default ?? (mod as () => CorsOptions)) as () => CorsOptions;
});

describe('cors-config', (): void => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.ALLOW_NO_ORIGIN;
  });

  it('returns development options by default and allows localhost origin', (): void => {
    process.env.NODE_ENV = 'development';
    const opts = getCorsOptions();
    const originFn = opts.origin as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    const cb = jest.fn();
    originFn('http://localhost:3000', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('development allows no origin (e.g., curl)', () => {
    process.env.NODE_ENV = 'development';
    const opts = getCorsOptions();
    const originFn = opts.origin as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    const cb = jest.fn();
    originFn(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('production blocks when ALLOWED_ORIGINS not set', (): void => {
    process.env.NODE_ENV = 'production';
    const opts = getCorsOptions();
    const originFn = opts.origin as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    const cb = jest.fn();
    originFn('https://evil.com', cb);
    expect(cb).toHaveBeenCalled();
  });

  it('production allows origin in ALLOWED_ORIGINS', (): void => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://www.example.com';
    const opts = getCorsOptions();
    const originFn = opts.origin as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    const cb = jest.fn();
    originFn('https://app.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('production rejects missing origin header when ALLOW_NO_ORIGIN is false', (): void => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    process.env.ALLOW_NO_ORIGIN = 'false';
    const opts = getCorsOptions();
    const originFn = opts.origin as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    const cb = jest.fn();
    originFn(undefined, cb);
    expect(cb).toHaveBeenCalled();
  });
});
