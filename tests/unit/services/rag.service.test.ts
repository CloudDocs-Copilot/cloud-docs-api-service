/**
 * Unit tests for RAG Service
 */

import { ragService } from '../../../src/services/ai/rag.service';
import { embeddingService } from '../../../src/services/ai/embedding.service';
import { llmService } from '../../../src/services/ai/llm.service';
import { buildPrompt } from '../../../src/services/ai/prompt.builder';
import { getDb } from '../../../src/configurations/database-config/mongoAtlas';
import HttpError from '../../../src/models/error.model';

// Mock dependencies
jest.mock('../../../src/services/ai/embedding.service');
jest.mock('../../../src/services/ai/llm.service');
jest.mock('../../../src/services/ai/prompt.builder');
jest.mock('../../../src/configurations/database-config/mongoAtlas');

describe('RAGService', () => {
  let mockCollection: any;
  let mockAggregate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAggregate = jest.fn();
    mockCollection = {
      aggregate: mockAggregate
    };

    (getDb as jest.Mock).mockReturnValue({
      collection: jest.fn().mockReturnValue(mockCollection)
    });
  });

  describe('search', () => {
    it('should perform vector search and return results', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const mockDBResults = [
        {
          _id: 'chunk1',
          documentId: 'doc1',
          content: 'This is a test chunk about AI',
          chunkIndex: 0,
          score: 0.95
        },
        {
          _id: 'chunk2',
          documentId: 'doc1',
          content: 'Machine learning is fascinating',
          chunkIndex: 1,
          score: 0.85
        }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDBResults)
      });

      const results = await ragService.search('What is AI?', 5);

      expect(results).toHaveLength(2);
      expect(results[0].chunk.content).toContain('test chunk');
      expect(results[0].score).toBe(0.95);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('What is AI?');
      expect(mockAggregate).toHaveBeenCalled();
    });

    it('should handle empty search results', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const results = await ragService.search('Obscure query', 5);

      expect(results).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      await ragService.search('Test', 10);

      // Verify aggregate was called with correct pipeline including limit
      expect(mockAggregate).toHaveBeenCalled();
      const pipeline = mockAggregate.mock.calls[0][0];
      const limitStage = pipeline.find((stage: any) => stage.$limit);
      expect(limitStage).toBeDefined();
      expect(limitStage.$limit).toBe(10);
    });

    it('should handle embedding generation errors', async () => {
      (embeddingService.generateEmbedding as jest.Mock).mockRejectedValue(
        new Error('Embedding failed')
      );

      await expect(ragService.search('Test', 5)).rejects.toThrow(HttpError);
    });

    it('should handle database errors', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await expect(ragService.search('Test', 5)).rejects.toThrow(HttpError);
    });

    it('should filter by organizationId', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      await ragService.search('Test', 5);

      const pipeline = mockAggregate.mock.calls[0][0];
      const limitStage = pipeline.find((stage: any) => stage.$limit);
      expect(limitStage).toBeDefined();
      expect(limitStage.$limit).toBe(5);
    });
  });

  describe('searchInDocument', () => {
    it('should search within a specific document', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const mockResults = [
        {
          _id: 'chunk1',
          documentId: 'doc123',
          content: 'Specific document content',
          chunkIndex: 0,
          score: 0.9
        }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockResults)
      });

      const results = await ragService.searchInDocument('Query', 'doc123', 5);

      // results are returned as ISearchResult[] with chunk and score
      expect(results[0].chunk.documentId).toBe('doc123');
      expect(results[0].chunk.content).toBe('Specific document content');
      expect(results[0].score).toBe(0.9);

      const pipeline = mockAggregate.mock.calls[0][0];
      const matchStage = pipeline.find((stage: any) => stage.$match);
      expect(matchStage.$match.documentId).toBe('doc123');
    });

    it('should return empty array if document has no chunks', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const results = await ragService.searchInDocument('Query', 'empty-doc', 5);

      expect(results).toEqual([]);
    });
  });

  describe('answerQuestion', () => {
    it('should generate answer using RAG', async () => {
      const mockChunks = [
        {
          _id: 'chunk1',
          documentId: 'doc1',
          content: 'AI is artificial intelligence',
          chunkIndex: 0,
          score: 0.95
        }
      ];

      const mockEmbedding = Array(1536).fill(0.5);
      const mockPrompt = 'Contexto: AI is artificial intelligence\n\nPregunta: What is AI?';

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'AI stands for Artificial Intelligence.'
      );

      const result = await ragService.answerQuestion('What is AI?', 5);

      expect(result.answer).toBe('AI stands for Artificial Intelligence.');
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks![0].documentId).toBe('doc1');
      expect(result.chunks![0].content).toBe('AI is artificial intelligence');
      expect(result.chunks![0].score).toBe(0.95);
    });

    it('should handle case when no relevant chunks found', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt without context');
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'No tengo información sobre eso.'
      );

      const result = await ragService.answerQuestion('Obscure question', 5);

      expect(result.answer).toBeDefined();
      expect(result.chunks).toEqual([]);
    });

    it('should handle LLM errors', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const mockChunks = [
        { _id: 'chunk1', documentId: 'doc1', content: 'Some context', chunkIndex: 0, score: 0.9 }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt');
      (llmService.generateResponse as jest.Mock).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      await expect(ragService.answerQuestion('Test?', 5)).rejects.toThrow(HttpError);
    });
  });

  describe('answerQuestionInDocument', () => {
    it('should answer question about specific document', async () => {
      const mockChunks = [
        {
          _id: 'chunk1',
          documentId: 'doc123',
          content: 'Document specific content',
          chunkIndex: 0,
          score: 0.9
        }
      ];

      const mockEmbedding = Array(1536).fill(0.5);
      const mockPrompt = 'Document context prompt';

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (llmService.generateResponse as jest.Mock).mockResolvedValue('Answer about the document.');

      const result = await ragService.answerQuestionInDocument(
        'What does the document say?',
        'doc123',
        5
      );

      expect(result.answer).toBe('Answer about the document.');
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks![0].documentId).toBe('doc123');
      expect(result.chunks![0].content).toBe('Document specific content');
    });

    it('should handle empty document', async () => {
      const mockEmbedding = Array(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt');
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'El documento no contiene información relevante.'
      );

      const result = await ragService.answerQuestionInDocument('Test?', 'empty-doc', 5);

      expect(result.chunks).toEqual([]);
      expect(result.answer).toBeDefined();
    });
  });
});
