import HttpError from '../../../src/models/error.model';

describe('EmbeddingService - Provider abstraction dimension checks', () => {
  let embeddingService: any;
  let mockProvider: any;

  beforeEach(() => {
    jest.resetModules();

    mockProvider = {
      generateEmbedding: jest.fn(),
      generateEmbeddings: jest.fn(),
      getEmbeddingDimensions: jest.fn(() => 1536),
      getEmbeddingModel: jest.fn(() => 'text-embedding-3-small')
    };

    jest.doMock('../../../src/services/ai/providers/provider.factory', () => ({
      getAIProvider: () => mockProvider
    }));

    embeddingService = require('../../../src/services/ai/embedding.service').embeddingService;
  });

  describe('generateEmbedding - dimension awareness', () => {
    it('returns embedding matching provider dimensions when provider returns correct size', async () => {
      const dims = 1536;
      const embedding = Array(dims).fill(0.1);

      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbedding.mockResolvedValue({ embedding });

      const result = await embeddingService.generateEmbedding('Test');

      expect(result).toHaveLength(dims);
      expect(embeddingService.getDimensions()).toBe(dims);
    });

    it('returns embedding even if provider returns unexpected dimensions (detectable)', async () => {
      const providerDims = 1536;
      const wrongEmbedding = Array(512).fill(0);

      mockProvider.getEmbeddingDimensions.mockReturnValue(providerDims);
      mockProvider.generateEmbedding.mockResolvedValue({ embedding: wrongEmbedding });

      const result = await embeddingService.generateEmbedding('Test');

      // Service currently does not enforce dimension equality, but the mismatch is detectable
      expect(result).toHaveLength(512);
      expect(embeddingService.getDimensions()).toBe(providerDims);
      expect(result.length).not.toBe(embeddingService.getDimensions());
    });
  });

  describe('generateEmbeddings - batch dimension observations', () => {
    it('returns embeddings array and preserves individual lengths', async () => {
      const dims = 1536;
      const embA = Array(dims).fill(0.1);
      const embB = Array(dims).fill(0.2);

      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbeddings.mockResolvedValue([{ embedding: embA }, { embedding: embB }]);

      const texts = ['A', 'B'];
      const result = await embeddingService.generateEmbeddings(texts);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(dims);
      expect(result[1]).toHaveLength(dims);
    });

    it('throws when provider returns fewer results than input texts', async () => {
      const dims = 1536;
      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbeddings.mockResolvedValue([{ embedding: Array(dims).fill(0) }]);

      const texts = ['T1', 'T2', 'T3'];

      await expect(embeddingService.generateEmbeddings(texts)).rejects.toThrow(
        'Expected 3 embeddings'
      );
    });
  });
});
