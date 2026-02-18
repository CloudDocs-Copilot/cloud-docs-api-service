import type http from 'http';

const serverToEmitMock = jest.fn();

let lastServerInstance: any = null;
let lastCtorArgs: any[] | null = null;

jest.mock('socket.io', () => {
  class ServerMock {
    public opts: any;
    public middlewares: any[] = [];
    public handlers: Record<string, Function> = {};
    public to = jest.fn().mockReturnValue({ emit: serverToEmitMock });

    constructor(_server: any, opts: any) {
      this.opts = opts;
      lastCtorArgs = [_server, opts];
      lastServerInstance = this;
    }

    use(fn: any) {
      this.middlewares.push(fn);
    }

    on(event: string, fn: Function) {
      this.handlers[event] = fn;
    }
  }

  return { __esModule: true, Server: ServerMock };
});

// ✅ Mock BOTH jsonwebtoken.verify and jsonwebtoken.default.verify (same function)
jest.mock('jsonwebtoken', () => {
  const verify = jest.fn();
  return {
    __esModule: true,
    verify,
    default: { verify }
  };
});

function loadSocketModuleFresh() {
  // Important: reset module registry so socket internal singleton `io` resets
  jest.resetModules();

  // Re-require AFTER resetModules so we get the SAME mocked instance socket.ts uses
  const jwt = require('jsonwebtoken');
  const mod = require('../../../src/socket/socket');

  return { mod, jwt };
}

describe('socket/socket (unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    serverToEmitMock.mockClear();
    lastServerInstance = null;
    lastCtorArgs = null;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function makeSocket(overrides: any = {}) {
    const socket: any = {
      handshake: {
        headers: {},
        auth: {}
      },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      ...overrides
    };
    return socket;
  }

  it('initSocket returns singleton instance on repeated calls', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://a.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    const s1 = mod.initSocket({} as http.Server);
    const s2 = mod.initSocket({} as http.Server);

    expect(s2).toBe(s1);
    expect(lastCtorArgs).not.toBeNull();
  });

  it('CORS origin callback allows when origin is missing', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = '';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1];
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('CORS blocks when ALLOWED_ORIGINS empty and origin present', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = '';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1];
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://evil.com', cb);

    const err = cb.mock.calls[0][0];
    const allowed = cb.mock.calls[0][1];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('CORS blocked');
    expect(allowed).toBe(false);
  });

  it('CORS allows when origin is in ALLOWED_ORIGINS', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com, http://also.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1];
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://also.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('CORS blocks when origin not in ALLOWED_ORIGINS', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1];
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://nope.com', cb);

    const err = cb.mock.calls[0][0];
    const allowed = cb.mock.calls[0][1];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('CORS blocked');
    expect(allowed).toBe(false);
  });

  it('auth middleware rejects when no token present', () => {
    const { mod } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket();
    const next = jest.fn();

    mw(socket, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Unauthorized');
  });

  it('auth middleware rejects when token invalid (jwt.verify throws)', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket({
      handshake: {
        headers: { authorization: 'Bearer abc' },
        auth: {}
      }
    });
    const next = jest.fn();

    mw(socket, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Unauthorized');
  });

  it('auth middleware rejects when JWT_SECRET missing (treated as invalid token)', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    delete process.env.JWT_SECRET;
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket({
      handshake: {
        headers: { authorization: 'Bearer abc' },
        auth: {}
      }
    });
    const next = jest.fn();

    mw(socket, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Unauthorized');
  });

  it('extracts token from Authorization Bearer, sets socket.data.userId, allows', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'user-1' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket({
      handshake: {
        headers: { authorization: 'Bearer token123' },
        auth: {}
      }
    });
    const next = jest.fn();

    mw(socket, next);

    expect(socket.data.userId).toBe('user-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('extracts token from handshake.auth.token', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ userId: 'user-2' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket({
      handshake: {
        headers: {},
        auth: { token: 'abc' }
      }
    });
    const next = jest.fn();

    mw(socket, next);

    expect(socket.data.userId).toBe('user-2');
    expect(next).toHaveBeenCalledWith();
  });

  it('extracts token from cookie header', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ sub: 'user-3' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance.middlewares[0];
    const socket = makeSocket({
      handshake: {
        headers: { cookie: 'a=1; token=jwt%2Etoken%2Ehere; b=2' },
        auth: {}
      }
    });
    const next = jest.fn();

    mw(socket, next);

    expect(socket.data.userId).toBe('user-3');
    expect(next).toHaveBeenCalledWith();
  });

  it('on connection: joins user room and emits socket:connected', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const onConn = lastServerInstance.handlers['connection'];
    expect(typeof onConn).toBe('function');

    const socket = makeSocket({ data: { userId: 'u1' } });
    onConn(socket);

    expect(socket.join).toHaveBeenCalledWith('user:u1');
    expect(socket.emit).toHaveBeenCalledWith('socket:connected', { userId: 'u1' });
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('emitToUser is safe when io not initialized', () => {
    const { mod } = loadSocketModuleFresh();
    mod.emitToUser('u1', 'evt', { a: 1 });
  });

  it('emitToUser emits to user room after init', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    mod.emitToUser('u1', 'notification:new', { hello: 'world' });

    expect(lastServerInstance.to).toHaveBeenCalledWith('user:u1');
    expect(serverToEmitMock).toHaveBeenCalledWith('notification:new', { hello: 'world' });
  });

  it('emitToOrg emits to org room after init', () => {
    const { mod, jwt } = loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    mod.emitToOrg('org1', 'org:event', { ok: true });

    expect(lastServerInstance.to).toHaveBeenCalledWith('org:org1');
    expect(serverToEmitMock).toHaveBeenCalledWith('org:event', { ok: true });
  });
});
