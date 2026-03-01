// Tests for configuration utilities to improve coverage
jest.resetModules();

describe('env-config utilities', (): void => {
  let envConfig: {
    getEnv: (k: string, d?: string) => string;
    requireEnv: (k: string) => string;
    getEnvBool: (k: string, d?: boolean) => boolean;
    getEnvNumber: (k: string, d?: number) => number;
  };

  beforeAll(async () => {
    envConfig = (await import('../../../src/configurations/env-config')) as unknown as typeof import('../../../src/configurations/env-config');
  });

  it('getEnv returns default when not set and requireEnv throws', (): void => {
    process.env.TEST_FOO = '';
    expect(envConfig.getEnv('NON_EXISTENT_VAR', 'default')).toBe('default');
    expect(() => envConfig.requireEnv('NON_EXISTENT_VAR')).toThrow();
  });

  it('getEnvBool and getEnvNumber parse values', (): void => {
    process.env.BOOL_TRUE = 'true';
    process.env.BOOL_ONE = '1';
    process.env.NUM_VAL = '42';

    expect(envConfig.getEnvBool('BOOL_TRUE', false)).toBe(true);
    expect(envConfig.getEnvBool('BOOL_ONE', false)).toBe(true);
    expect(envConfig.getEnvNumber('NUM_VAL', 0)).toBe(42);
  });
});

describe('elasticsearch-config', (): void => {
  beforeAll(() => {
    // Mock @elastic/elasticsearch Client used by the module
    jest.mock('@elastic/elasticsearch', () => ({
      Client: class {
        cluster = { health: async () => ({ status: 'green' }) };
        indices = {
          exists: async () => false,
          create: async () => ({ acknowledged: true })
        };
      }
    }));
  });

  it('initializes client and can create index', async (): Promise<void> => {
    const esModule = (await import('../../../src/configurations/elasticsearch-config')) as unknown;
    const maybeDefault = (esModule as Record<string, unknown>)['default'] ?? esModule;
    const ES = (maybeDefault as unknown) as {
      checkConnection: () => Promise<boolean>;
      createDocumentIndex: () => Promise<void>;
    };
    const ok = await ES.checkConnection();
    expect(ok).toBe(true);
    await expect(ES.createDocumentIndex()).resolves.toBeUndefined();
  });
});
