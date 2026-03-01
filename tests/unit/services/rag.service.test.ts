/**
 * Unit tests for RAG Service
 */

import { ragService } from '../../../src/services/ai/rag.service';
import { embeddingService } from '../../../src/services/ai/embedding.service';
import { llmService } from '../../../src/services/ai/llm.service';
import { buildPrompt } from '../../../src/services/ai/prompt.builder';
// `getDb` will be obtained from the mocked module at runtime to ensure it's a jest.Mock
let getDb: unknown;
import HttpError from '../../../src/models/error.model';
import mongoose from 'mongoose';

// Mock dependencies
jest.mock('../../../src/services/ai/embedding.service');
jest.mock('../../../src/services/ai/llm.service');
jest.mock('../../../src/services/ai/prompt.builder');
jest.mock('../../../src/configurations/database-config/mongoAtlas');

// Search result can be either the internal shape returned by search()/searchInDocument
// or the flattened shape returned by answerQuestion()/answerQuestionInDocument.
type ISearchResult =
  | { chunk: { documentId: mongoose.Types.ObjectId | string; content: string; chunkIndex?: number }; score: number }
  | { documentId: mongoose.Types.ObjectId | string; content: string; score: number };

type RAGServiceType = {
  search: (q: string, orgId: string, limit: number) => Promise<ISearchResult[]>;
  searchInDocument: (q: string, orgId: string, docId: string, limit: number) => Promise<ISearchResult[]>;
  answerQuestion: (q: string, orgId: string, limit: number) => Promise<{ answer: string; chunks?: ISearchResult[] }>;
  answerQuestionInDocument: (q: string, orgId: string, docId: string, limit: number) => Promise<{ answer: string; chunks?: ISearchResult[] }>;
};

const RagTyped = ragService as unknown as RAGServiceType;

describe('RAGService', (): void => {
  const doc1Id = new mongoose.Types.ObjectId();
  const doc123Id = new mongoose.Types.ObjectId();
  const chunk1Id = new mongoose.Types.ObjectId();
  const chunk2Id = new mongoose.Types.ObjectId();
  let mockCollection: unknown;
  let mockAggregate: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAggregate = jest.fn();
    mockCollection = {
      aggregate: mockAggregate
    } as unknown;

    // Obtain the mocked `getDb` implementation from the mocked module via dynamic import
    const mocked = await import('../../../src/configurations/database-config/mongoAtlas') as unknown as { getDb: jest.Mock };
    getDb = mocked.getDb;

    // Ensure getDb is a jest.Mock so tests can set mockResolvedValue.
    if (typeof (getDb as any).mockResolvedValue !== 'function') {
      // Replace the exported function with a mock implementation.
      (mocked as any).getDb = jest.fn().mockResolvedValue({
        collection: jest.fn().mockReturnValue(mockCollection)
      });
      getDb = (mocked as any).getDb;
    } else {
      (getDb as jest.Mock).mockResolvedValue({
        collection: jest.fn().mockReturnValue(mockCollection)
      });
    }
  });

  describe('search', (): void => {
    it('should perform vector search and return results', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);
      const mockDBResults = [
        {
          _id: chunk1Id,
          documentId: doc1Id,
          content: 'This is a test chunk about AI',
          chunkIndex: 0,
          score: 0.95
        },
        {
          _id: chunk2Id,
          documentId: doc1Id,
          content: 'Machine learning is fascinating',
          chunkIndex: 1,
          score: 0.85
        }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDBResults)
      });

      const results = (await RagTyped.search('What is AI?', 'org123', 5)) as Array<{
        chunk: { documentId: mongoose.Types.ObjectId | string; content: string; chunkIndex?: number };
        score: number;
      }>;

      expect(results).toHaveLength(2);
      expect(results[0].chunk.content).toContain('test chunk');
      expect(results[0].score).toBe(0.95);
      expect(results[0].chunk.documentId.toString()).toBe(doc1Id.toString());
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('What is AI?');
      expect(mockAggregate).toHaveBeenCalled();
    });

    it('should handle empty search results', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const results = (await RagTyped.search('Obscure query', 'org123', 5)) as Array<{
        chunk: { documentId: mongoose.Types.ObjectId | string; content: string; chunkIndex?: number };
        score: number;
      }>;

      expect(results).toEqual([]);
    });

    it('should respect limit parameter', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      await RagTyped.search('Test', 'org123', 10);

      // Verify aggregate was called with correct pipeline including limit
      expect(mockAggregate).toHaveBeenCalled();
      const pipeline = mockAggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
      const limitStage = pipeline.find((stage: unknown) => (stage as { $limit?: number }).$limit !== undefined) as { $limit?: number } | undefined;
      expect(limitStage).toBeDefined();
      expect(limitStage!.$limit).toBe(10);
    });

    it('should handle embedding generation errors', async (): Promise<void> => {
      (embeddingService.generateEmbedding as jest.Mock).mockRejectedValue(
        new Error('Embedding failed')
      );

      await expect(RagTyped.search('Test', 'org123', 5)).rejects.toThrow(HttpError);
    });

    it('should handle database errors', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await expect(RagTyped.search('Test', 'org123', 5)).rejects.toThrow(HttpError);
    });

    it('should filter by organizationId', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      await RagTyped.search('Test', 'org123', 5);

      const pipeline = mockAggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
      const limitStage = pipeline.find((stage: unknown) => (stage as { $limit?: number }).$limit !== undefined);
      expect(limitStage).toBeDefined();
      expect((limitStage as { $limit?: number }).$limit).toBe(5);
    });
  });

  describe('searchInDocument', (): void => {
    it('should search within a specific document', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);
      const mockResults = [
        {
          _id: chunk1Id,
          documentId: doc123Id,
          content: 'Specific document content',
          chunkIndex: 0,
          score: 0.9
        }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockResults)
      });

      const results = (await RagTyped.searchInDocument('Query', 'org123', doc123Id.toString(), 5)) as Array<{
        chunk: { documentId: mongoose.Types.ObjectId | string; content: string; chunkIndex?: number };
        score: number;
      }>;

      // results are returned as ISearchResult[] with chunk and score
      expect(results[0].chunk.documentId.toString()).toBe(doc123Id.toString());
      expect(results[0].chunk.content).toBe('Specific document content');
      expect(results[0].score).toBe(0.9);

      const pipeline = mockAggregate.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
      const matchStage = pipeline.find((stage: unknown) => (stage as { $match?: Record<string, unknown> }).$match !== undefined) as { $match?: Record<string, unknown> } | undefined;
      expect(matchStage).toBeDefined();
      // documentId filter may be a string in the pipeline; compare as string
      expect(String(matchStage!.$match!['documentId'])).toEqual(doc123Id.toString());
    });

    it('should return empty array if document has no chunks', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const results = (await RagTyped.searchInDocument('Query', 'org123', 'empty-doc', 5)) as Array<{
        chunk: { documentId: mongoose.Types.ObjectId | string; content: string; chunkIndex?: number };
        score: number;
      }>;

      expect(results).toEqual([]);
    });
  });

  describe('answerQuestion', (): void => {
    it('should generate answer using RAG', async (): Promise<void> => {
      const mockChunks = [
        {
          _id: chunk1Id,
          documentId: doc1Id,
          content: 'AI is artificial intelligence',
          chunkIndex: 0,
          score: 0.95
        }
      ];

      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);
      const mockPrompt = 'Contexto: AI is artificial intelligence\n\nPregunta: What is AI?';

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'AI stands for Artificial Intelligence.'
      );

      const result = await RagTyped.answerQuestion('What is AI?', 'org123', 5);

      expect(result.answer).toBe('AI stands for Artificial Intelligence.');
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks).toHaveLength(1);
      // answerQuestion returns flattened chunk objects: { documentId, content, score }
      expect((result.chunks![0] as any).documentId.toString()).toBe(doc1Id.toString());
      expect((result.chunks![0] as any).content).toBe('AI is artificial intelligence');
      expect((result.chunks![0] as any).score).toBe(0.95);
    });

    it('should handle case when no relevant chunks found', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt without context');
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'No tengo información sobre eso.'
      );

      const result = await RagTyped.answerQuestion('Obscure question', 'org123', 5);

      expect(result.answer).toBeDefined();
      expect(result.chunks).toEqual([]);
    });

    it('should handle LLM errors', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);
      const mockChunks = [
        { _id: chunk1Id, documentId: doc1Id, content: 'Some context', chunkIndex: 0, score: 0.9 }
      ];

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt');
      (llmService.generateResponse as jest.Mock).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      await expect(RagTyped.answerQuestion('Test?', 'org123', 5)).rejects.toThrow(HttpError);
    });
  });

  describe('answerQuestionInDocument', (): void => {
    it('should answer question about specific document', async (): Promise<void> => {
      const mockChunks = [
        {
          _id: 'chunk1',
          documentId: doc123Id,
          content: 'Document specific content',
          chunkIndex: 0,
          score: 0.9
        }
      ];

      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);
      const mockPrompt = 'Document context prompt';

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockChunks)
      });

      (buildPrompt as jest.Mock).mockReturnValue(mockPrompt);
      (llmService.generateResponse as jest.Mock).mockResolvedValue('Answer about the document.');

      const result = await RagTyped.answerQuestionInDocument(
        'What does the document say?',
        'org123',
        doc123Id.toString(),
        5
      );

      expect(result.answer).toBe('Answer about the document.');
      expect(result.chunks).toBeInstanceOf(Array);
      expect(result.chunks).toHaveLength(1);
      // answerQuestionInDocument returns flattened chunk objects: { documentId, content, score }
      expect((result.chunks![0] as any).documentId.toString()).toBe(doc123Id.toString());
      expect((result.chunks![0] as any).content).toBe('Document specific content');
    });

    it('should handle empty document', async (): Promise<void> => {
      const mockEmbedding: number[] = Array<number>(1536).fill(0.5);

      (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue(mockEmbedding);

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      (buildPrompt as jest.Mock).mockReturnValue('Prompt');
      (llmService.generateResponse as jest.Mock).mockResolvedValue(
        'El documento no contiene información relevante.'
      );

      const result = await ragService.answerQuestionInDocument('Test?', 'org123', 'empty-doc', 5);

      expect(result.chunks).toEqual([]);
      expect(result.answer).toBeDefined();
    });
  });
});
