type EmbeddingServiceType = {
  generateEmbedding: (text: string) => Promise<number[]>;
  generateEmbeddings: (texts: string[]) => Promise<number[][]>;
  getDimensions: () => number;
};

type ProviderMock = {
  generateEmbedding: jest.Mock<Promise<{ embedding: number[] }>, [string]>;
  generateEmbeddings: jest.Mock<Promise<Array<{ embedding: number[] }>>, [string[]]>;
  getEmbeddingDimensions: jest.Mock<number, []>;
  getEmbeddingModel: jest.Mock<string, []>;
};

describe('EmbeddingService - Provider abstraction dimension checks', (): void => {
  let embeddingService: EmbeddingServiceType;
  let mockProvider: ProviderMock;

  beforeEach(async () => {
    jest.resetModules();

    mockProvider = {
      generateEmbedding: jest.fn(),
      generateEmbeddings: jest.fn(),
      getEmbeddingDimensions: jest.fn(() => 1536),
      getEmbeddingModel: jest.fn(() => 'text-embedding-3-small')
    } as unknown as ProviderMock;

    jest.doMock('../../../src/services/ai/providers/provider.factory', () => ({
      getAIProvider: () => mockProvider
    }));

    embeddingService = ((await import('../../../src/services/ai/embedding.service')) as unknown as typeof import('../../../src/services/ai/embedding.service')).embeddingService as unknown as EmbeddingServiceType;
  });

  describe('generateEmbedding - dimension awareness', (): void => {
    it('returns embedding matching provider dimensions when provider returns correct size', async (): Promise<void> => {
      const dims = 1536;
      const embedding: number[] = Array<number>(dims).fill(0.1);

      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbedding.mockResolvedValue({ embedding });

      const result = await embeddingService.generateEmbedding('Test');

      expect(result).toHaveLength(dims);
      expect(embeddingService.getDimensions()).toBe(dims);
    });

    it('returns embedding even if provider returns unexpected dimensions (detectable)', async () => {
      const providerDims = 1536;
      const wrongEmbedding: number[] = Array<number>(512).fill(0);

      mockProvider.getEmbeddingDimensions.mockReturnValue(providerDims);
      mockProvider.generateEmbedding.mockResolvedValue({ embedding: wrongEmbedding });

      const result = await embeddingService.generateEmbedding('Test');

      // Service currently does not enforce dimension equality, but the mismatch is detectable
      expect(result).toHaveLength(512);
      expect(embeddingService.getDimensions()).toBe(providerDims);
      expect(result.length).not.toBe(embeddingService.getDimensions());
    });
  });

  describe('generateEmbeddings - batch dimension observations', (): void => {
    it('returns embeddings array and preserves individual lengths', async (): Promise<void> => {
      const dims = 1536;
      const embA: number[] = Array<number>(dims).fill(0.1);
      const embB: number[] = Array<number>(dims).fill(0.2);

      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbeddings.mockResolvedValue([{ embedding: embA }, { embedding: embB }] as unknown as Array<{ embedding: number[] }>);

      const texts = ['A', 'B'];
      const result = await embeddingService.generateEmbeddings(texts);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(dims);
      expect(result[1]).toHaveLength(dims);
    });

    it('throws when provider returns fewer results than input texts', async (): Promise<void> => {
      const dims = 1536;
      mockProvider.getEmbeddingDimensions.mockReturnValue(dims);
      mockProvider.generateEmbeddings.mockResolvedValue([{ embedding: Array<number>(dims).fill(0) }] as unknown as Array<{ embedding: number[] }>);

      const texts = ['T1', 'T2', 'T3'];

      await expect(embeddingService.generateEmbeddings(texts)).rejects.toThrow(
        'Expected 3 embeddings'
      );
    });
  });
});
