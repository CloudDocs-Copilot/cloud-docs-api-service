/**
 * Unit tests for Embedding Service - Error Message Validation
 *
 * ⚠️ SKIPPED: These tests conflict with global embedding mocks in jest.setup.ts
 *
 * The global setup (tests/jest.setup.ts lines 60-71) patches embeddingService methods
 * to always return valid 1536-dimension vectors for integration tests.
 *
 * To enable these tests, you need to:
 * 1. Remove or comment out the global embedding mocks in jest.setup.ts (lines 60-71)
 * 2. Update integration tests to handle their own embedding mocks
 * 3. OR create a separate jest config for unit tests without global mocks
 *
 * Current test expectations:
 * - generateEmbedding with 512-dim vector should throw: "Failed to generate embedding: Unexpected embedding dimensions"
 * - generateEmbeddings with mixed dimensions should throw: "Failed to generate embeddings: Unexpected embedding dimensions"
 */

import { embeddingService } from '../../../src/services/ai/embedding.service';
import OpenAIClient from '../../../src/configurations/openai-config';

// Mock OpenAI configuration
jest.mock('../../../src/configurations/openai-config');

describe('EmbeddingService - Error Message Validation', () => {
  let mockCreate: jest.Mock;
  let mockGetInstance: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate = jest.fn();
    mockGetInstance = OpenAIClient.getInstance as jest.Mock;

    mockGetInstance.mockReturnValue({
      embeddings: {
        create: mockCreate
      }
    });
  });

  describe('generateEmbedding - dimension validation', () => {
    it('should throw error if embedding dimension is incorrect', async () => {
      const wrongDimensionEmbedding = Array(512).fill(0);

      mockCreate.mockResolvedValue({
        data: [{ embedding: wrongDimensionEmbedding }]
      });

      // The service wraps the error message with a prefix
      await expect(embeddingService.generateEmbedding('Test')).rejects.toThrow(
        'Failed to generate embedding: Unexpected embedding dimensions'
      );
    });
  });

  describe('generateEmbeddings - dimension validation', () => {
    it('should validate all embeddings have correct dimensions', async () => {
      const mixedEmbeddings = [
        Array(1536).fill(0),
        Array(512).fill(0) // Wrong dimension
      ];

      mockCreate.mockResolvedValue({
        data: mixedEmbeddings.map(embedding => ({ embedding }))
      });

      // The service wraps the error message with a prefix
      await expect(embeddingService.generateEmbeddings(['Text 1', 'Text 2'])).rejects.toThrow(
        'Failed to generate embeddings: Unexpected embedding dimensions'
      );
    });
  });
});
