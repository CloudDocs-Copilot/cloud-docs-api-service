import { jest } from '@jest/globals';
import http from 'http';

// Instrumentation used by multiple mocked Server implementations
interface ServerMock {
  opts: unknown;
  middlewares: Array<(socket: unknown, next: (err?: Error) => void) => void>;
  handlers: Record<string, (socket: unknown) => void>;
  to: jest.MockedFunction<(room: string) => { emit: (event: string, payload: unknown) => void }>;
  lastEmit?: unknown;
  use: (fn: (socket: unknown, next: (err?: Error) => void) => void) => void;
  on: (event: string, fn: (socket: unknown) => void) => void;
  _use?: (socket: unknown, next: (err?: Error) => void) => void;
  _onConnection?: (socket: unknown) => void;
}

interface ServerOptions {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
  };
}

interface JwtMock {
  verify: jest.Mock;
  sign: jest.Mock;
  default: { verify: jest.Mock; sign: jest.Mock };
}

interface SocketModule {
  initSocket: (server: http.Server) => ServerMock;
  emitToUser: (userId: string, event: string, payload?: unknown) => void;
  emitToOrg: (orgId: string, event: string, payload?: unknown) => void;
}

let lastServerInstance: ServerMock | null = null;
let lastCtorArgs: [unknown, unknown] | null = null;

async function importSocketModule(): Promise<SocketModule> {
  return (await import('../../../src/socket/socket')) as unknown as SocketModule;
}

describe('socket module', (): void => {
  let FakeServer: { new(_server: unknown, opts: unknown): ServerMock } | undefined;
  beforeEach((): void => {
    jest.resetModules();
    FakeServer = class {
      public opts: unknown;
      public middlewares: Array<(s: unknown, next: (err?: Error) => void) => void> = [];
      public handlers: Record<string, (s: unknown) => void> = {};
      public lastEmit: unknown = null;
      public _use: ((socket: unknown, next: (err?: Error) => void) => void) | undefined = undefined;
      public _onConnection: ((socket: unknown) => void) | undefined = undefined;

      constructor(_server: unknown, opts: unknown) {
        this.opts = opts;
        lastCtorArgs = [_server, opts];
        lastServerInstance = this as unknown as ServerMock;
      }

      use(fn: (s: unknown, next: (err?: Error) => void) => void): void {
        this.middlewares.push(fn);
        this._use = fn;
      }

      on(ev: string, cb: (s: unknown) => void): void {
        this.handlers[ev] = cb;
        if (ev === 'connection') this._onConnection = cb;
      }

      to: jest.MockedFunction<(room: string) => { emit: (event: string, payload: unknown) => void }> =
        jest.fn().mockImplementation((room: unknown) => {
          const roomStr = String(room);
          return {
            emit: (event: string, payload: unknown): void => {
              ((this as unknown) as { lastEmit?: unknown }).lastEmit = { room: roomStr, event, payload };
              serverToEmitMock(event, payload);
            }
          };
        }) as unknown as jest.MockedFunction<(room: string) => { emit: (event: string, payload: unknown) => void }>;
    };

    jest.doMock('socket.io', () => ({ Server: FakeServer }));
  });

  it('emitToUser is no-op when io not initialized', async (): Promise<void> => {
    const mod = await importSocketModule();
    // ensure io is not initialized
    mod.emitToUser('u1', 'e', { a: 1 });
    // no throw
  });

  it('initSocket returns server and emitToUser emits to room', async (): Promise<void> => {
    const mod = await importSocketModule();
    const server = http.createServer();
    const io = mod.initSocket(server as unknown as http.Server) as unknown as ServerMock;
    expect(io.to).toBeDefined();

    // call emitToUser
    mod.emitToUser('user42', 'hello', { ok: true });
    expect((io).lastEmit).toEqual({ room: 'user:user42', event: 'hello', payload: { ok: true } });
  });

  it('emitToOrg emits to org room', async (): Promise<void> => {
    const mod = await importSocketModule();
    const server = http.createServer();
    const io = mod.initSocket(server as unknown as http.Server) as unknown as ServerMock;
    mod.emitToOrg('org1', 'ev', { x: 1 });
    expect(io.lastEmit).toEqual({ room: 'org:org1', event: 'ev', payload: { x: 1 } });
  });

  it('initSocket returns same instance on subsequent calls', async (): Promise<void> => {
    const mod = await importSocketModule();
    const server = http.createServer();
    const a = mod.initSocket(server as unknown as http.Server);
    const b = mod.initSocket(server as unknown as http.Server);
    expect(a).toBe(b);
  });

  it('auth middleware accepts valid JWT token provided in auth.token', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();
    process.env.JWT_SECRET = 'test-secret';
    const http = await import('http');
    const server = http.createServer();
    const io = mod.initSocket(server as unknown as http.Server) as unknown as ServerMock;

    // create token with userId
    const token = jwt.sign({ userId: 'u1' });

    // fake socket object
    const fakeSocket = { handshake: { auth: { token }, headers: {} }, data: {} } as unknown;

    // run the middleware stored in FakeServer
    const middleware = io._use as (s: unknown, next: (err?: Error) => void) => void;
    let nextCalled = false;
    middleware(fakeSocket, (err?: Error) => {
      if (err) throw err;
      nextCalled = true;
    });

    // simulate connection callback registration and invocation
    expect(nextCalled).toBe(true);
  });

  it('auth middleware rejects invalid JWT', async (): Promise<void> => {
    process.env.JWT_SECRET = 's';
    const mod = await importSocketModule();
    const http = await import('http');
    const server = http.createServer();
    const io = mod.initSocket(server as unknown as http.Server) as unknown as ServerMock;
    const fakeSocket = { handshake: { auth: { token: 'badtoken' }, headers: {} }, data: {} } as unknown;
    const middleware = io._use as (s: unknown, next: (err?: Error) => void) => void;
    let thrown = false;
    try {
      middleware(fakeSocket, (err?: Error) => {
        if (err) throw err;
      });
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
  });

  it('on connection emits socket:connected to client (via emit in connection handler)', async () => {
    const { mod, jwt } = await loadSocketModuleFresh();
    process.env.JWT_SECRET = 't';
    const http = await import('http');
    const server = http.createServer();
    const io = mod.initSocket(server as unknown as http.Server) as unknown as ServerMock;
    const token = jwt.sign({ userId: 'u2' });
    const fakeSocket = {
      handshake: { auth: { token }, headers: {} },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      on: jest.fn()
    } as unknown as { join: jest.Mock; emit: jest.Mock; on: jest.Mock };

    // run middleware
    (io._use as (s: unknown, next: (err?: Error) => void) => void)(fakeSocket, (err?: Error) => {
      if (err) throw err;
    });

    // call connection handler to simulate a new connection
    (io._onConnection as (s: unknown) => void)(fakeSocket);
    expect((fakeSocket as { join: jest.Mock }).join).toHaveBeenCalled();
    expect((fakeSocket as { emit: jest.Mock }).emit).toHaveBeenCalledWith('socket:connected', { userId: 'u2' });
  });
});
// Note: these are unit tests for the socket module, not integration tests. We mock socket.io and jsonwebtoken to test socket.ts logic in isolation without needing a real server or real JWTs.

// Simple smoke tests before mocks are applied
describe('socket module - basic safety', (): void => {
  beforeEach((): void => {
    jest.resetModules();
  });

  it('emitToUser and emitToOrg are safe when not initialized', async (): Promise<void> => {
    // Arrange: Load module fresh with no initialization
    const mod = await importSocketModule();
    const { emitToUser, emitToOrg } = mod;

    // Act & Assert: should not throw
    expect(() => emitToUser('u1', 'e', { x: 1 })).not.toThrow();
    expect(() => emitToOrg('org1', 'e', { x: 1 })).not.toThrow();
  });

  it('initSocket returns a Server instance when JWT_SECRET provided', async (): Promise<void> => {
    // Arrange
    process.env.JWT_SECRET = 'test-secret';
    process.env.ALLOWED_ORIGINS = '';
    const mod = await importSocketModule();
    const { initSocket } = mod;
    const server = http.createServer();

    // Act
    const io = initSocket(server as unknown as http.Server);

    // Assert
    expect(io).toBeDefined();
    server.close();
  });

  it('initSocket returns same instance on second call', async (): Promise<void> => {
    // Arrange
    process.env.JWT_SECRET = 'test-secret';
    const mod = await importSocketModule();
    const { initSocket } = mod;
    const server = http.createServer();

    // Act
    const io1 = initSocket(server as unknown as http.Server);
    const io2 = initSocket(server as unknown as http.Server);

    // Assert
    expect(io1).toBe(io2);
    server.close();
  });

  it('extract token flow via initSocket middleware indirectly', async (): Promise<void> => {
    // Arrange
    process.env.JWT_SECRET = 'test-secret';
    process.env.ALLOWED_ORIGINS = 'http://localhost';
    const mod = await importSocketModule();
    const { initSocket } = mod;
    const server = http.createServer();

    // Act & Assert
    expect(() => initSocket(server as unknown as http.Server)).not.toThrow();
    server.close();
  });
});



const serverToEmitMock = jest.fn();

lastServerInstance = null;
lastCtorArgs = null;

jest.mock('socket.io', () => {
  class ServerMock {
    public opts: unknown;
    public middlewares: Array<(socket: unknown, next: (err?: Error) => void) => void> = [];
    public handlers: Record<string, (socket: unknown) => void> = {};
    public to: jest.MockedFunction<(room: string) => { emit: (event: string, payload: unknown) => void }> =
      jest.fn().mockReturnValue({ emit: serverToEmitMock }) as unknown as jest.MockedFunction<(
        room: string
      ) => { emit: (event: string, payload: unknown) => void }>;

    constructor(_server: unknown, opts: unknown) {
      this.opts = opts;
      lastCtorArgs = [_server, opts];
      lastServerInstance = this as unknown as ServerMock;
    }

    use(fn: (socket: unknown, next: (err?: Error) => void) => void): void {
      this.middlewares.push(fn);
    }

    on(event: string, fn: (socket: unknown) => void): void {
      this.handlers[event] = fn;
    }
  }

  return { __esModule: true, Server: ServerMock };
});

// ✅ Mock BOTH jsonwebtoken.verify and jsonwebtoken.default.verify (same function)
jest.mock('jsonwebtoken', () => {
  const sign = jest.fn((payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64'));
    const verify = jest.fn((token: string): unknown => {
    try {
      const s = Buffer.from(token, 'base64').toString();
      return JSON.parse(s) as unknown;
    } catch (e: unknown) {
      // Preserve original caught value as the cause to retain debugging context
      throw new Error('bad token', { cause: e });
    }
  });

  return {
    __esModule: true,
    verify,
    sign,
    default: { verify, sign }
  };
});

async function loadSocketModuleFresh(): Promise<{ mod: SocketModule; jwt: JwtMock }> {
  // Important: reset module registry so socket internal singleton `io` resets
  jest.resetModules();

  const jwt = await import('jsonwebtoken');
  const mod = (await import('../../../src/socket/socket')) as unknown as SocketModule;

  const jwtModule = jwt as unknown as JwtMock;
  return { mod, jwt: jwtModule };
}

describe('socket/socket (unit)', () => {
  const originalEnv = process.env;

  beforeEach((): void => {
    process.env = { ...originalEnv };
    serverToEmitMock.mockClear();
    lastServerInstance = null;
    lastCtorArgs = null;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  interface MockSocket {
    handshake: {
      headers: Record<string, unknown>;
      auth: Record<string, unknown>;
    };
    data: Record<string, unknown>;
    join: jest.Mock;
    emit: jest.Mock;
    on: jest.Mock;
  }

  function makeSocket(overrides: Partial<MockSocket> = {}): MockSocket {
    const socket: MockSocket = {
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

  it('initSocket returns singleton instance on repeated calls', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://a.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    const s1 = mod.initSocket({} as http.Server);
    const s2 = mod.initSocket({} as http.Server);

    expect(s2).toBe(s1);
    expect(lastCtorArgs).not.toBeNull();
  });

  it('CORS origin callback allows when origin is missing', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = '';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1] as ServerOptions;
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('CORS blocks when ALLOWED_ORIGINS empty and origin present', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = '';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1] as ServerOptions;
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://evil.com', cb);

    const err = cb.mock.calls[0][0];
    const allowed = cb.mock.calls[0][1];
    expect(err).toBeInstanceOf(Error);
    if (err instanceof Error) {
      expect(err.message).toBe('CORS blocked');
    }
    expect(allowed).toBe(false);
  });

  it('CORS allows when origin is in ALLOWED_ORIGINS', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com, http://also.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1] as ServerOptions;
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://also.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('CORS blocks when origin not in ALLOWED_ORIGINS', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const opts = lastCtorArgs![1] as ServerOptions;
    const originFn = opts.cors.origin;

    const cb = jest.fn();
    originFn('http://nope.com', cb);

    const err = cb.mock.calls[0][0];
    const allowed = cb.mock.calls[0][1];
    expect(err).toBeInstanceOf(Error);
    if (err instanceof Error) {
      expect(err.message).toBe('CORS blocked');
    }
    expect(allowed).toBe(false);
  });

  it('auth middleware rejects when no token present', async (): Promise<void> => {
    const { mod } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
    const socket = makeSocket();
    const next = jest.fn();

    mw(socket, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    if (err instanceof Error) {
      expect(err.message).toBe('Unauthorized');
    }
  });

  it('auth middleware rejects when token invalid (jwt.verify throws)', async () => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
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
    if (err instanceof Error) {
      expect(err.message).toBe('Unauthorized');
    }
  });

  it('auth middleware rejects when JWT_SECRET missing (treated as invalid token)', async () => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    delete process.env.JWT_SECRET;
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
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
    if (err instanceof Error) {
      expect(err.message).toBe('Unauthorized');
    }
  });

  it('extracts token from Authorization Bearer, sets socket.data.userId, allows', async () => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'user-1' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
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

  it('extracts token from handshake.auth.token', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ userId: 'user-2' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
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

  it('extracts token from cookie header', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ sub: 'user-3' });

    mod.initSocket({} as http.Server);

    const mw = lastServerInstance!.middlewares[0];
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

  it('on connection: joins user room and emits socket:connected', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    const onConn = lastServerInstance!.handlers['connection'];
    expect(typeof onConn).toBe('function');

    const socket = makeSocket({ data: { userId: 'u1' } });
    onConn(socket);

    expect(socket.join).toHaveBeenCalledWith('user:u1');
    expect(socket.emit).toHaveBeenCalledWith('socket:connected', { userId: 'u1' });
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('emitToUser is safe when io not initialized', async (): Promise<void> => {
    const { mod } = await loadSocketModuleFresh();
    mod.emitToUser('u1', 'evt', { a: 1 });
  });

  it('emitToUser emits to user room after init', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    mod.emitToUser('u1', 'notification:new', { hello: 'world' });

    expect(lastServerInstance!.to).toHaveBeenCalledWith('user:u1');
    expect(serverToEmitMock).toHaveBeenCalledWith('notification:new', { hello: 'world' });
  });

  it('emitToOrg emits to org room after init', async (): Promise<void> => {
    const { mod, jwt } = await loadSocketModuleFresh();

    process.env.ALLOWED_ORIGINS = 'http://ok.com';
    process.env.JWT_SECRET = 'secret';
    jwt.verify.mockReturnValue({ id: 'u1' });

    mod.initSocket({} as http.Server);

    mod.emitToOrg('org1', 'org:event', { ok: true });

    expect(lastServerInstance!.to).toHaveBeenCalledWith('org:org1');
    expect(serverToEmitMock).toHaveBeenCalledWith('org:event', { ok: true });
  });
});
