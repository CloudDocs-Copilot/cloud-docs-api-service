/**
 * Helper para configurar el entorno de tests de integración AI
 * Aplica patches dinámicos para evitar llamadas a APIs externas
 */

const EMBEDDING_DIMENSIONS = 1536;
const makeVector = () => new Array(EMBEDDING_DIMENSIONS).fill(0.01);

/**
 * Aplica patches a los servicios AI para tests de integración
 * Debe llamarse en beforeAll() de los tests de integración
 */
export function setupAIIntegrationMocks() {
  // Force LLM to use global OpenAI mock
  process.env.USE_OPENAI_GLOBAL_MOCK = 'true';

  // Patch embedding service
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const embeddingModule = require('../../src/services/ai/embedding.service');
  if (embeddingModule && embeddingModule.embeddingService) {
    embeddingModule.embeddingService.generateEmbedding = jest.fn(async (_text: string) =>
      makeVector()
    );
    embeddingModule.embeddingService.generateEmbeddings = jest.fn(async (_texts: string[]) =>
      _texts.map(() => makeVector())
    );
    embeddingModule.embeddingService.getDimensions = jest.fn(() => EMBEDDING_DIMENSIONS);
    embeddingModule.embeddingService.getModel = jest.fn(() => 'mock-embedding-model');
  }

  // Patch MongoDB Atlas module to use in-memory collection
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
export function cleanupAIIntegrationMocks() {
  delete process.env.USE_OPENAI_GLOBAL_MOCK;
  jest.restoreAllMocks();
}
