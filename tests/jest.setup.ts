// Load environment variables from .env for integration tests
import dotenv from 'dotenv';
dotenv.config();

// Force AI provider to mock in test runs to avoid external LLM calls
// Always force the mock provider in the test environment to ensure deterministic AI behavior
process.env.AI_PROVIDER = 'mock';

// Ensure common storage and fixture directories exist for integration tests
import * as fs from 'fs';
import * as path from 'path';
const storageBase = path.join(process.cwd(), 'storage');
const fixturesBase = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
try {
  if (!fs.existsSync(storageBase)) fs.mkdirSync(storageBase, { recursive: true });
  if (!fs.existsSync(fixturesBase)) fs.mkdirSync(fixturesBase, { recursive: true });
} catch {
  // ignore - tests will surface file errors where appropriate
}

// Global Jest setup for tests
// Mock pdf-parse to avoid loading native bindings in integration tests
jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({
    numpages: 1,
    text: 'Mocked PDF text content for testing',
    info: {
      Title: 'Test PDF',
      Author: 'Test Author',
      Creator: 'Test Creator',
      Producer: 'Test Producer'
    }
  })
}));
// Mock mammoth to avoid loading heavy native/binary parsing code in tests
jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn(async (_buffer: unknown): Promise<{ value: string }> => ({ value: '' }))
  }
}));
// Mock Ollama provider to ensure deterministic behaviour if imported directly
jest.mock('../src/services/ai/providers/ollama.provider', () => {
    class FakeOllamaProvider {
    name = 'ollama-mock';
    async checkConnection(): Promise<boolean> {
      return true;
    }
    async generateResponse(prompt: string, _opts?: unknown): Promise<{ response: string; model: string }> {
      // Return a deterministic JSON response string
      const payload = JSON.stringify({ summary: `Resumen mock para: ${prompt.substring(0,50)}`, keyPoints: ['kp1','kp2'] });
      return { response: payload, model: 'llama-mock' };
    }
    async summarizeDocument(text: string): Promise<{ summary: string; keyPoints: string[] }> {
      return { summary: `Resumen mock: ${text.substring(0,100)}`, keyPoints: ['kp1','kp2'] };
    }
    async generateEmbedding(_text: string): Promise<{ embedding: number[]; dimensions: number; model: string }> {
      return { embedding: new Array(768).fill(0.01), dimensions: 768, model: 'ollama-embed-mock' };
    }
    getEmbeddingDimensions(): number { return 768; }
    getEmbeddingModel(): string { return 'ollama-embed-mock'; }
    getChatModel(): string { return 'llama-mock'; }
  }

  return { __esModule: true, OllamaProvider: FakeOllamaProvider };
});
// Mock the search service so tests don't require a running Elasticsearch instance

jest.mock('../src/services/search.service', () => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0, took: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([])
}));

// Optional: silence only specific noisy errors from Elasticsearch/indexing
const originalConsoleError = console.error;
console.error = (...args: unknown[]): void => {
  const msg = String(args[0] || '');
  if (
    msg.includes('Error indexing document') ||
    msg.includes('Failed to index document in search') ||
    msg.includes('Elasticsearch client initialized') ||
    msg.includes('Elasticsearch cluster status') ||
    msg.includes('Error creating Elasticsearch index')
  ) {
    return; // suppress known noisy messages only
  }
  // otherwise forward to original
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

// Mock embedding service methods to avoid external API calls during tests
jest.mock('../src/services/ai/embedding.service', () => {
  const EMBEDDING_DIMENSIONS = 1536;
  const makeVector = (): number[] => new Array(EMBEDDING_DIMENSIONS).fill(0.01) as number[];

  return {
    __esModule: true,
    embeddingService: {
      generateEmbedding: jest.fn(async (_text: string): Promise<number[]> => makeVector()),
      generateEmbeddings: jest.fn(async (_texts: string[]): Promise<number[][]> => _texts.map(() => makeVector())),
      getDimensions: jest.fn((): number => EMBEDDING_DIMENSIONS),
      getModel: jest.fn((): string => 'mock-embedding-model')
    }
  };
});

// Note: OpenAI client instance is not globally mocked here to allow per-test overrides.

// Note: do not globally mock llmService.generateResponse here — unit tests should
// mock OpenAI/chat completions or the llmService per-suite to assert behavior.

// Provide a global hook for OpenAI chat completions so tests can set it reliably.
// Default implementation returns a small mock response to avoid real API calls
(global as unknown as { __OPENAI_CREATE_IMPL__?: (...args: unknown[]) => Promise<unknown> }).__OPENAI_CREATE_IMPL__ = async (_opts: unknown) => ({
  choices: [{ message: { content: 'Mocked answer from OpenAI (test)' } }],
  usage: { total_tokens: 5 },
  id: 'mocked-response'
});
(global as unknown as { __OPENAI_CREATE__?: (...args: unknown[]) => Promise<unknown> }).__OPENAI_CREATE__ = async (...args: unknown[]) => {
  const g = global as unknown as { __OPENAI_CREATE_IMPL__?: (...args: unknown[]) => Promise<unknown> };
  if (g.__OPENAI_CREATE_IMPL__) {
    return g.__OPENAI_CREATE_IMPL__(...args);
  }
  return { choices: [{ message: { content: 'Mocked answer from OpenAI (fallback)' } }] };
};

// For integration runs, tests may set `USE_OPENAI_GLOBAL_MOCK` themselves when
// they need the LLM to use the global OpenAI hook. Do not force it globally
// here to avoid interfering with unit tests.

// Removed duplicate in-memory mongo collection factory; the real jest.mock below
// provides the in-memory implementation used by tests.

// Provide a jest.mock for mongoAtlas to use the in-memory collection implementation
jest.mock('../src/configurations/database-config/mongoAtlas', () => {
  type MockDoc = Record<string, unknown>;

  interface MockCollection {
    insertMany(docs: MockDoc[]): Promise<{ insertedCount: number }>;
    deleteMany(filter: unknown): Promise<{ deletedCount: number }>;
    find(filter: unknown): { sort: () => { toArray: () => Promise<MockDoc[]> } };
    countDocuments(filter: unknown, _opts?: unknown): Promise<number>;
    distinct(field: string): Promise<unknown[]>;
    aggregate(pipeline: unknown[]): { toArray: () => Promise<MockDoc[]> };
    command(_cmd: unknown): Promise<{ ok: number }>;
  }

  const stores: Record<string, MockDoc[]> = {};

  const _collectionFactory = (name: string): MockCollection => {
    stores[name] = stores[name] || [];

    return {
      insertMany: async (docs: MockDoc[]) => {
        stores[name].push(...docs.map(d => ({ ...d })));
        return { insertedCount: docs.length };
      },
      deleteMany: async (filter: unknown) => {
        const hasDocumentId = filter && typeof filter === 'object' && 'documentId' in (filter as MockDoc);
        if (!hasDocumentId) {
          const deleted = stores[name].length;
          stores[name] = [];
          return { deletedCount: deleted };
        }
        const before = stores[name].length;
        const docId = String((filter as MockDoc).documentId);
        stores[name] = (stores[name] || []).filter(d => d.documentId !== docId);
        return { deletedCount: before - (stores[name] || []).length };
      },
      find: (filter: unknown) => ({
        sort: () => ({
          toArray: async () => {
            const docId = filter && typeof filter === 'object' && 'documentId' in (filter as MockDoc) ? String((filter as MockDoc).documentId) : undefined;
            if (docId) return (stores[name] || []).filter(d => d.documentId === docId);
            return (stores[name] || []).slice();
          }
        })
      }),
      countDocuments: async (filter: unknown, _opts?: unknown) => {
        const docId = filter && typeof filter === 'object' && 'documentId' in (filter as MockDoc) ? String((filter as MockDoc).documentId) : undefined;
        if (docId) return (stores[name] || []).filter(d => d.documentId === docId).length;
        return (stores[name] || []).length;
      },
      distinct: async (field: string) => Array.from(new Set((stores[name] || []).map(d => d[field]))) as unknown[],
      aggregate: (pipeline: unknown[]) => ({
        toArray: async () => {
          const all = (stores[name] || []).slice();

          const vsStage = Array.isArray(pipeline)
            ? pipeline.find(p => {
                if (!p || typeof p !== 'object') return false;
                const obj = p as Record<string, unknown>;
                return '$vectorSearch' in obj || '$vectorSearch' in obj;
              })
            : null;

          let results: MockDoc[] = all.slice();

          if (vsStage && typeof vsStage === 'object') {
            const stageObj = vsStage as Record<string, unknown>;
            const stage = (stageObj['$vectorSearch'] ?? stageObj['$vectorSearch']) as Record<string, unknown> | undefined;

            const filter = stage && (stage['filter'] as Record<string, unknown> | undefined);
            let docId: string | undefined;
            if (filter && 'documentId' in filter) {
              const docField = filter['documentId'] as Record<string, unknown> | undefined;
              if (docField && '$eq' in docField) {
                docId = String(docField['$eq']);
              }
            }
            if (docId) {
              results = results.filter(d => d.documentId === docId);
            }

            const limitVal = stage && stage['limit'];
            const limit = typeof limitVal === 'number' ? limitVal : undefined;
            if (typeof limit === 'number') {
              results = results.slice(0, limit);
            }
          }

          return results.map((d, i) => ({
            _id: (d['_id'] ?? `mock-${i}`),
            documentId: d['documentId'],
            content: d['content'],
            embedding: d['embedding'],
            createdAt: d['createdAt'],
            chunkIndex: d['chunkIndex'],
            wordCount: d['wordCount'],
            score: typeof d['score'] === 'number' ? d['score'] : 0.8
          }));
        }
      }),
      command: async (_cmd: unknown) => ({ ok: 1 })
    };
  };

  // Expose a minimal getDb/getClient implementation so production code calling
  // `getDb()` or `getClient()` works against the in-memory collection factory.
  const getDb = async (): Promise<{ collection: (name: string) => MockCollection }> => ({ collection: (name: string) => _collectionFactory(name) });
  const getClient = async (): Promise<null> => null;

  return {
    __esModule: true,
    _collectionFactory,
    getDb,
    getClient,
    isConnected: () => true,
    closeAtlasConnection: async () => undefined
  };
});
