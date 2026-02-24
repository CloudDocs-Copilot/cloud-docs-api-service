/**
 * Jest setup for UNIT TESTS only
 *
 * This setup file is identical to jest.setup.ts EXCEPT:
 * - It DOES NOT patch embedding service methods globally
 * - This allows unit tests to control their own embedding mocks
 * - Unit tests can test error conditions, edge cases, etc.
 */

// Load environment variables from .env for tests
require('dotenv').config();

// Mock pdf-parse to avoid loading native bindings in tests
jest.mock('pdf-parse', () => ({ __esModule: true, default: jest.fn() }));

// Mock mammoth to avoid loading heavy native/binary parsing code in unit tests
jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn(async (_buffer: any) => ({ value: '' }))
  }
}));

// Mock the search service so tests don't require a running Elasticsearch instance
jest.mock('../src/services/search.service', () => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0, took: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([])
}));

// Optional: silence noisy logs from Elasticsearch config during tests
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = String(args[0] || '');
  // Suppress known noisy messages from Elasticsearch/indexing and search
  if (
    msg.includes('Error indexing document') ||
    msg.includes('Failed to index document in search') ||
    msg.includes('Elasticsearch client initialized') ||
    msg.includes('Elasticsearch cluster status') ||
    msg.includes('Error creating Elasticsearch index')
  ) {
    return; // suppress in tests
  }
  originalConsoleError(...args);
};

// Mock email service to avoid real SMTP attempts during tests
jest.mock('../src/mail/emailService', () => ({
  sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined)
}));

// Mock Elasticsearch configuration/client to avoid network calls and init logs
jest.mock('../src/configurations/elasticsearch-config', () => {
  const mockClient = {
    getInstance: jest.fn(() => ({
      cluster: { health: jest.fn().mockResolvedValue({ status: 'green' }) },
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue(undefined)
      },
      index: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({ body: { hits: { hits: [], total: 0 }, took: 1 } })
    })),
    checkConnection: jest.fn().mockResolvedValue(true),
    createDocumentIndex: jest.fn().mockResolvedValue(undefined)
  };

  return { __esModule: true, default: mockClient };
});

// ⚠️ IMPORTANT: DO NOT patch embedding service methods here
// Unit tests need full control over embedding mocks to test error conditions
// Integration tests use jest.setup.ts which includes the global embedding mocks

// Note: OpenAI client instance is not globally mocked here to allow per-test overrides.

// Provide a global hook for OpenAI chat completions so tests can set it reliably.
// Default implementation returns a small mock response to avoid real API calls
(global as any).__OPENAI_CREATE_IMPL__ = async (_opts: any) => ({
  choices: [{ message: { content: 'Mocked answer from OpenAI (test)' } }],
  usage: { total_tokens: 5 },
  id: 'mocked-response'
});
(global as any).__OPENAI_CREATE__ = async (...args: any[]) => {
  if ((global as any).__OPENAI_CREATE_IMPL__) {
    return (global as any).__OPENAI_CREATE_IMPL__(...args);
  }
  return { choices: [{ message: { content: 'Mocked answer from OpenAI (fallback)' } }] };
};

// Patch MongoDB Atlas module to use an in-memory collection implementation
{
  const stores: Record<string, any[]> = {};

  const collectionFactory = (name: string) => {
    stores[name] = stores[name] || [];

    return {
      insertMany: async (docs: any[]) => {
        stores[name].push(...docs.map(d => ({ ...d })));
        return { insertedCount: docs.length };
      },
      deleteMany: async (filter: any) => {
        if (!filter || !filter.documentId) {
          const deleted = stores[name].length;
          stores[name] = [];
          return { deletedCount: deleted };
        }
        const before = stores[name].length;
        stores[name] = stores[name].filter(d => d.documentId !== filter.documentId);
        return { deletedCount: before - stores[name].length };
      },
      find: (filter: any) => ({
        sort: () => ({
          toArray: async () => (stores[name] || []).filter(d => d.documentId === filter.documentId)
        })
      }),
      countDocuments: async (filter: any, _opts?: any) => {
        if (filter && filter.documentId)
          return (stores[name] || []).filter(d => d.documentId === filter.documentId).length;
        return (stores[name] || []).length;
      },
      distinct: async (field: string) =>
        Array.from(new Set((stores[name] || []).map(d => d[field]))),
      aggregate: (pipeline: any[]) => ({
        toArray: async () => {
          const all = stores[name] || [];

          // Try to detect a $vectorSearch stage to honor filter and limit
          const vsStage = Array.isArray(pipeline)
            ? pipeline.find(p => p && (p.$vectorSearch || p['$vectorSearch']))
            : null;

          let results = all;

          if (vsStage) {
            const stage = vsStage.$vectorSearch || vsStage['$vectorSearch'];
            // Apply documentId filter if present
            const filter = stage && stage.filter;
            if (filter && filter.documentId && filter.documentId.$eq) {
              const docId = filter.documentId.$eq;
              results = results.filter(d => d.documentId === docId);
            }

            // Apply limit if provided
            const limit = stage && stage.limit ? stage.limit : undefined;
            if (typeof limit === 'number') {
              results = results.slice(0, limit);
            }
          }

          // Map to include projected fields and a deterministic score
          return results.map((d: any, i: number) => ({
            _id: d._id ?? `mock-${i}`,
            documentId: d.documentId,
            content: d.content,
            embedding: d.embedding,
            createdAt: d.createdAt,
            chunkIndex: d.chunkIndex,
            wordCount: d.wordCount,
            score: typeof d.score === 'number' ? d.score : 0.8
          }));
        }
      }),
      command: async (_cmd: any) => ({ ok: 1 })
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const atlasModule = require('../src/configurations/database-config/mongoAtlas');
  if (atlasModule) {
    atlasModule.getDb = async () => ({
      collection: (name: string) => collectionFactory(name),
      command: async () => ({ ok: 1 })
    });
    atlasModule.getClient = () => null;
    atlasModule.closeAtlasConnection = async () => undefined;
    atlasModule.isConnected = () => true;
  }
}
