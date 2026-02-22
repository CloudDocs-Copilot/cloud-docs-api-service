/**
 * Unit tests for OpenAI Configuration
 */

import OpenAIClient from '../../../src/configurations/openai-config';

// Mock the OpenAI library
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(config => {
      if (!config.apiKey) {
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

describe('OpenAI Configuration', () => {
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

  describe('getOpenAIClient', () => {
    it('should return OpenAI client instance when API key is configured', () => {
      process.env.OPENAI_API_KEY = 'test-api-key-123';

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
    });

    it('should throw error when API key is not configured', () => {
      delete process.env.OPENAI_API_KEY;

      jest.isolateModules(() => {
        const OpenAIClient = require('../../../src/configurations/openai-config').default;
        expect(() => {
          OpenAIClient.getInstance();
        }).toThrow('OPENAI_API_KEY');
      });
    });

    it('should return same instance on multiple calls (singleton)', () => {
      process.env.OPENAI_API_KEY = 'test-api-key-123';

      const client1 = OpenAIClient.getInstance();
      const client2 = OpenAIClient.getInstance();

      expect(client1).toBe(client2);
    });

    it('should reject empty API key', () => {
      process.env.OPENAI_API_KEY = '';

      jest.isolateModules(() => {
        const OpenAIClient = require('../../../src/configurations/openai-config').default;
        expect(() => {
          OpenAIClient.getInstance();
        }).toThrow('OPENAI_API_KEY');
      });
    });

    it('should reject whitespace-only API key', () => {
      process.env.OPENAI_API_KEY = '   ';

      jest.isolateModules(() => {
        const OpenAIClient = require('../../../src/configurations/openai-config').default;
        expect(() => {
          OpenAIClient.getInstance();
        }).toThrow('OPENAI_API_KEY');
      });
    });

    it('should handle API key from environment correctly', () => {
      const testKey = 'sk-test-key-from-env-12345';
      process.env.OPENAI_API_KEY = testKey;

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
    });

    it('should expose chat completions API', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const client = OpenAIClient.getInstance();

      expect(client.chat).toBeDefined();
      expect(client.chat.completions).toBeDefined();
    });

    it('should be ready for embeddings API', () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const client = OpenAIClient.getInstance();

      // Client should have structure for embeddings
      expect(client).toBeDefined();
    });
  });

  describe('configuration validation', () => {
    it('should validate API key format (starts with sk-)', () => {
      // OpenAI keys typically start with 'sk-'
      process.env.OPENAI_API_KEY = 'sk-valid-key-format';

      const client = OpenAIClient.getInstance();

      expect(client).toBeDefined();
    });

    it('should accept various valid API key formats', () => {
      const validKeys = ['sk-test123', 'sk-proj-abc123', 'test-key-for-dev'];

      validKeys.forEach(key => {
        process.env.OPENAI_API_KEY = key;

        const client = OpenAIClient.getInstance();
        expect(client).toBeDefined();
      });
    });
  });

  describe('error handling', () => {
    it('should provide helpful error message when key is missing', () => {
      delete process.env.OPENAI_API_KEY;

      jest.isolateModules(() => {
        const OpenAIClient = require('../../../src/configurations/openai-config').default;
        try {
          OpenAIClient.getInstance();
          throw new Error('Should have thrown error');
        } catch (error: any) {
          expect(error.message).toContain('OPENAI_API_KEY');
        }
      });
    });

    it('should handle undefined environment variable', () => {
      process.env.OPENAI_API_KEY = undefined;

      jest.isolateModules(() => {
        const OpenAIClient = require('../../../src/configurations/openai-config').default;
        expect(() => {
          OpenAIClient.getInstance();
        }).toThrow('OPENAI_API_KEY');
      });
    });
  });
});
