/**
 * Unit tests for Embedding Service
 *
 * ⚠️ IMPORTANT: These tests are currently SKIPPED due to global mock conflicts.
 *
 * The global mocks in tests/jest.setup.ts (lines 67-71) patch embeddingService methods
 * to avoid external API calls during integration tests. However, these global mocks
 * override the local mocks in these unit tests, causing all tests to fail.
 *
 * Global mocks return:
 * - generateEmbedding(): returns Array<number> directly (not a Promise)
 * - generateEmbeddings(): returns Array<Array<number>> directly (not a Promise)
 *
 * This prevents unit tests from:
 * - Testing error handling (API errors, validation errors, etc.)
 * - Mocking specific OpenAI responses
 * - Testing edge cases
 *
 * To enable these tests:
 * Option 1: Comment out lines 67-71 in tests/jest.setup.ts (breaks integration tests)
 * Option 2: Create a separate jest.config for unit tests with different setup
 * Option 3: Refactor global mocks to allow per-test overrides
 *
 * For now, these tests remain skipped to avoid false failures.
 */

let embeddingService: any;
let mockProvider: any;
import HttpError from '../../../src/models/error.model';

// Tests that work with current mock setup (dimension validation tests moved to separate file)
describe('Embedding Service', () => {
  let mockProvider: any;

  beforeEach(() => {
    // Reset modules and mock the provider factory so we control provider behaviour
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

  describe('generateEmbedding', () => {
    it('should generate embedding for valid text', async () => {
      const mockEmbedding = Array(1536)
        .fill(0)
        .map((_, i) => i / 1536);

      mockProvider.generateEmbedding.mockResolvedValue({ embedding: mockEmbedding });

      const result = await embeddingService.generateEmbedding('Test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockProvider.generateEmbedding).toHaveBeenCalledWith('Test text');
    });

    it('should handle OpenAI API errors', async () => {
      mockProvider.generateEmbedding.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(embeddingService.generateEmbedding('Test')).rejects.toThrow(/Failed to generate embedding/);
    });

    it('should throw error for empty text input', async () => {
      await expect(embeddingService.generateEmbedding('')).rejects.toThrow(
        'Text cannot be empty for embedding generation'
      );

      await expect(embeddingService.generateEmbedding('   ')).rejects.toThrow(
        'Text cannot be empty for embedding generation'
      );
    });

    it('should handle very long text input', async () => {
      const longText = 'word '.repeat(10000); // 10,000 words
      const mockEmbedding = Array(1536).fill(0);

      mockProvider.generateEmbedding.mockResolvedValue({ embedding: mockEmbedding });

      const result = await embeddingService.generateEmbedding(longText);

      expect(result).toBeDefined();
      expect(mockProvider.generateEmbedding).toHaveBeenCalled();
    });

    it('should handle special characters in text', async () => {
      const specialText = '¡Hola! ¿Cómo estás? 你好 مرحبا';
      const mockEmbedding = Array(1536).fill(0);

      mockProvider.generateEmbedding.mockResolvedValue({ embedding: mockEmbedding });

      const result = await embeddingService.generateEmbedding(specialText);

      expect(result).toBeDefined();
      expect(result.length).toBe(1536);
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const mockEmbeddings = [Array(1536).fill(0.1), Array(1536).fill(0.2), Array(1536).fill(0.3)];

      mockProvider.generateEmbeddings.mockResolvedValue(mockEmbeddings.map(embedding => ({ embedding })));

      const texts = ['Text 1', 'Text 2', 'Text 3'];
      const result = await embeddingService.generateEmbeddings(texts);

      expect(result).toEqual(mockEmbeddings);
      expect(mockProvider.generateEmbeddings).toHaveBeenCalledWith(texts);
    });

    it('should throw error for empty array input', async () => {
      await expect(embeddingService.generateEmbeddings([])).rejects.toThrow(
        'Texts array cannot be empty'
      );
    });

    it('should throw error if result count does not match input count', async () => {
      mockProvider.generateEmbeddings.mockResolvedValue([{ embedding: Array(1536).fill(0) }]);

      const texts = ['Text 1', 'Text 2', 'Text 3'];

      await expect(embeddingService.generateEmbeddings(texts)).rejects.toThrow('Expected 3 embeddings');
    });

    it('should handle batch processing for large arrays', async () => {
      const largeArray = Array(100).fill('test text');
      const mockEmbedding = Array(1536).fill(0);

      mockProvider.generateEmbeddings.mockResolvedValue(largeArray.map(() => ({ embedding: mockEmbedding })));

      const result = await embeddingService.generateEmbeddings(largeArray);

      expect(result.length).toBe(100);
      expect(mockProvider.generateEmbeddings).toHaveBeenCalled();
    });

    it('should handle API errors during batch processing', async () => {
      mockProvider.generateEmbeddings.mockRejectedValue(new Error('Batch processing failed'));

      await expect(embeddingService.generateEmbeddings(['Text 1', 'Text 2'])).rejects.toThrow(/Failed to generate embeddings/);
    });
  });
});
