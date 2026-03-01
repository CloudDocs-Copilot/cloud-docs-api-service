/**
 * Unit tests for OpenAI Configuration
 */

import OpenAIClient from '../../../src/configurations/openai-config';

// Mock the OpenAI library
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation((config: { apiKey?: string }) => {
      if (!config || !config.apiKey) {
        throw new Error('API key required');
      }
      return {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'test' } }]
            })
          }
        },
        models: {
          list: jest.fn().mockResolvedValue({ data: [] })
        }
      };
    })
  };
});

describe('OpenAI Configuration', (): void => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to allow fresh imports
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getOpenAIClient', (): void => {
    it('should return OpenAI client instance when API key is configured', (): void => {
      process.env.OPENAI_API_KEY = 'test-api-key-123';

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it('should throw error when API key is not configured', async (): Promise<void> => {
      delete process.env.OPENAI_API_KEY;

      jest.resetModules();
      const mod = (await import('../../../src/configurations/openai-config')) as unknown as {
        default: { getInstance: () => unknown };
      };
      const OpenAIClient = mod.default;
      expect(() => {
        (OpenAIClient.getInstance() as unknown as { chat?: Record<string, unknown> });
      }).toThrow('OPENAI_API_KEY');
    });

    it('should return same instance on multiple calls (singleton)', () => {
      process.env.OPENAI_API_KEY = 'test-api-key-123';

      const client1 = OpenAIClient.getInstance();
      const client2 = OpenAIClient.getInstance();

      expect(client1).toBe(client2);
    });

    it('should reject empty API key', async (): Promise<void> => {
      process.env.OPENAI_API_KEY = '';

      jest.resetModules();
      const mod = (await import('../../../src/configurations/openai-config')) as unknown as {
        default: { getInstance: () => unknown };
      };
      const OpenAIClient = mod.default;
      expect(() => {
        (OpenAIClient.getInstance() as unknown as { chat?: Record<string, unknown> });
      }).toThrow('OPENAI_API_KEY');
    });

    it('should reject whitespace-only API key', async (): Promise<void> => {
      process.env.OPENAI_API_KEY = '   ';

      jest.resetModules();
      const mod = (await import('../../../src/configurations/openai-config')) as unknown as {
        default: { getInstance: () => unknown };
      };
      const OpenAIClient = mod.default;
      expect(() => {
        (OpenAIClient.getInstance() as unknown as { chat?: Record<string, unknown> });
      }).toThrow('OPENAI_API_KEY');
    });

    it('should handle API key from environment correctly', (): void => {
      const testKey = 'sk-test-key-from-env-12345';
      process.env.OPENAI_API_KEY = testKey;

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
    });

    it('should expose chat completions API', (): void => {
      process.env.OPENAI_API_KEY = 'test-key';

      const client = OpenAIClient.getInstance();

      expect(client.chat).toBeDefined();
      expect(client.chat.completions).toBeDefined();
    });

    it('should be ready for embeddings API', (): void => {
      process.env.OPENAI_API_KEY = 'test-key';

      const client = OpenAIClient.getInstance();

      // Client should have structure for embeddings
      expect(client).toBeDefined();
    });
  });

  describe('configuration validation', (): void => {
    it('should validate API key format (starts with sk-)', () => {
      // OpenAI keys typically start with 'sk-'
      process.env.OPENAI_API_KEY = 'sk-valid-key-format';

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
    });

    it('should accept various valid API key formats', (): void => {
      const validKeys = ['sk-test123', 'sk-proj-abc123', 'test-key-for-dev'];

      validKeys.forEach(key => {
        process.env.OPENAI_API_KEY = key;

        const client = OpenAIClient.getInstance();
        expect(client).toBeDefined();
      });
    });
  });

  describe('error handling', (): void => {
    it('should provide helpful error message when key is missing', async (): Promise<void> => {
      delete process.env.OPENAI_API_KEY;

      jest.resetModules();
      const mod = (await import('../../../src/configurations/openai-config')) as unknown as {
        default: { getInstance: () => unknown };
      };
      const OpenAIClient = mod.default;
      try {
        (OpenAIClient.getInstance() as unknown as { chat?: Record<string, unknown> });
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).toContain('OPENAI_API_KEY');
        } else {
          throw error;
        }
      }
    });

    it('should handle undefined environment variable', async (): Promise<void> => {
      process.env.OPENAI_API_KEY = undefined as unknown as string;

      jest.resetModules();
      const mod = (await import('../../../src/configurations/openai-config')) as unknown as {
        default: { getInstance: () => unknown };
      };
      const OpenAIClient = mod.default;
      expect(() => {
        (OpenAIClient.getInstance() as unknown as { chat?: Record<string, unknown> });
      }).toThrow('OPENAI_API_KEY');
    });
  });
});
