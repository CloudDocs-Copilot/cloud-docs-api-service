/**
 * Helper para configurar el entorno de tests de integración AI
 * Aplica patches dinámicos para evitar llamadas a APIs externas
 */

/* eslint-disable */

const EMBEDDING_DIMENSIONS = 1536;
const makeVector = (): number[] => new Array(EMBEDDING_DIMENSIONS).fill(0.01);

/**
 * Aplica patches a los servicios AI para tests de integración
 * Debe llamarse en beforeAll() de los tests de integración
 */
export async function setupAIIntegrationMocks(): Promise<void> {
  // Force LLM to use global OpenAI mock
  process.env.USE_OPENAI_GLOBAL_MOCK = 'true';

  // Patch embedding service
  const embeddingModule = (await import('../../src/services/ai/embedding.service')) as unknown as {
    embeddingService?: {
      generateEmbedding?: jest.MockedFunction<(text: string) => Promise<number[]>>;
      generateEmbeddings?: jest.MockedFunction<(texts: string[]) => Promise<number[][]>>;
      getDimensions?: () => number;
      getModel?: () => string;
    };
  };

  if (embeddingModule && embeddingModule.embeddingService) {
    embeddingModule.embeddingService.generateEmbedding = jest.fn(async (_text: string) => makeVector());
    embeddingModule.embeddingService.generateEmbeddings = jest.fn(async (_texts: string[]) => _texts.map(() => makeVector()));
    embeddingModule.embeddingService.getDimensions = jest.fn(() => EMBEDDING_DIMENSIONS);
    embeddingModule.embeddingService.getModel = jest.fn(() => 'mock-embedding-model');
  }

  // Patch MongoDB Atlas module to use in-memory collection
  const stores: Record<string, Record<string, unknown>[]> = {};

  const collectionFactory = (name: string) => {
    stores[name] = stores[name] || [];

    return {
      insertMany: async (docs: Record<string, unknown>[]) => {
        stores[name].push(...docs.map(d => ({ ...d })));
        return { insertedCount: docs.length };
      },
      deleteMany: async (filter?: Record<string, unknown>) => {
        if (!filter || !filter.documentId) {
          const deleted = stores[name].length;
          stores[name] = [];
          return { deletedCount: deleted };
        }
        const before = stores[name].length;
        stores[name] = stores[name].filter(d => d.documentId !== filter.documentId);
        return { deletedCount: before - stores[name].length };
      },
      find: (filter?: Record<string, unknown>) => ({
        sort: () => ({
          toArray: async () => (stores[name] || []).filter(d => d.documentId === filter?.documentId)
        })
      }),
      countDocuments: async (filter?: Record<string, unknown>, _opts?: unknown) => {
        if (filter && filter.documentId) return (stores[name] || []).filter(d => d.documentId === filter.documentId).length;
        return (stores[name] || []).length;
      },
      distinct: async (field: string) => Array.from(new Set((stores[name] || []).map(d => d[field] as string))),
      aggregate: (pipeline: unknown[]) => ({
        toArray: async () => {
          const all = stores[name] || [];

          const vsStage = Array.isArray(pipeline) ? pipeline.find(p => p && ((p as any).$vectorSearch || (p as any)['$vectorSearch'])) : null;

          let results = all;

          if (vsStage) {
            const stage = (vsStage as any).$vectorSearch || (vsStage as any)['$vectorSearch'];
            const filter = stage && stage.filter;
            if (filter && filter.documentId && filter.documentId.$eq) {
              const docId = filter.documentId.$eq;
              results = results.filter(d => d.documentId === docId);
            }

            const limit = stage && stage.limit ? stage.limit : undefined;
            if (typeof limit === 'number') {
              results = results.slice(0, limit);
            }
          }

          return results.map((d, i) => ({
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
      command: async (_cmd?: unknown) => ({ ok: 1 })
    };
  };

  const mockDb = {
    collection: (name: string) => collectionFactory(name),
    command: async () => ({ ok: 1 })
  };

  // Use jest.doMock to ensure this takes effect before modules are loaded
  jest.doMock('../../src/configurations/database-config/mongoAtlas', () => ({
    getDb: jest.fn().mockResolvedValue(mockDb),
    getClient: jest.fn().mockReturnValue(null),
    closeAtlasConnection: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true)
  }));
}

/**
 * Limpia los mocks aplicados por setupAIIntegrationMocks
 */
export function cleanupAIIntegrationMocks(): void {
  delete process.env.USE_OPENAI_GLOBAL_MOCK;
  jest.restoreAllMocks();
}
