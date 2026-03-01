/**
 * Unit tests for Document Processor Service (updated to match current API)
 */

import { documentProcessor } from '../../../src/services/document-processor.service';
import { embeddingService } from '../../../src/services/ai/embedding.service';
import { splitIntoChunks } from '../../../src/utils/chunking.util';
import HttpError from '../../../src/models/error.model';

// Mocks
jest.mock('../../../src/services/ai/embedding.service');
jest.mock('../../../src/configurations/database-config/mongoAtlas');
jest.mock('../../../src/utils/chunking.util');

describe('DocumentProcessor (updated)', () => {
  let mockCollection: any;
  // `getDb` will be obtained from the mocked module at runtime to ensure it's a jest.Mock
  let getDb: unknown;
  let mockInsertMany: jest.Mock;
  let mockDeleteMany: jest.Mock;
  let mockFind: jest.Mock;
  let mockAggregate: jest.Mock;
  let mockCountDocuments: jest.Mock;
  let mockDistinct: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockInsertMany = jest.fn().mockResolvedValue({ insertedCount: 2 });
    mockDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
    mockFind = jest.fn();
    mockAggregate = jest.fn();
    mockCountDocuments = jest.fn();
    mockDistinct = jest.fn();

    mockCollection = {
      insertMany: mockInsertMany,
      deleteMany: mockDeleteMany,
      find: mockFind,
      aggregate: mockAggregate,
      countDocuments: mockCountDocuments,
      distinct: mockDistinct
    };
    // Obtain the mocked `getDb` implementation from the mocked module via dynamic import
    const mocked = await import('../../../src/configurations/database-config/mongoAtlas') as { getDb: jest.Mock };
    getDb = mocked.getDb;

    (getDb as jest.Mock).mockResolvedValue({
      collection: jest.fn().mockReturnValue(mockCollection)
    });
  });

  it('processes text and stores chunks', async (): Promise<void> => {
      const text = 'This is a test document. It has two sentences.';

      const chunks = ['This is a test document.', 'It has two sentences.'];
      const embeddings = [Array(1536).fill(0.1), Array(1536).fill(0.2)];

      (splitIntoChunks as jest.Mock).mockReturnValue(chunks);
      (embeddingService.generateEmbeddings as jest.Mock).mockResolvedValue(embeddings);

      const result = await documentProcessor.processDocument('doc123', 'org123', text);

      expect(result.documentId).toBe('doc123');
      expect(result.chunksCreated).toBe(2);
      expect(result.totalWords).toBeGreaterThan(0);
      expect(mockInsertMany).toHaveBeenCalled();
    });

  it('throws on empty text', async (): Promise<void> => {
      await expect(documentProcessor.processDocument('doc123', 'org123', '')).rejects.toThrow(
        HttpError
      );
    });

  it('handles embedding generation errors', async (): Promise<void> => {
      const text = 'Some content';
      (splitIntoChunks as jest.Mock).mockReturnValue(['Some content']);
      (embeddingService.generateEmbeddings as jest.Mock).mockRejectedValue(new Error('API error'));

      await expect(documentProcessor.processDocument('doc123', 'org123', text)).rejects.toThrow(
        HttpError
      );
    });

  describe('deleteDocumentChunks', (): void => {
    it('deletes chunks and returns number deleted', async (): Promise<void> => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await documentProcessor.deleteDocumentChunks('doc123');

      expect(result).toBe(5);
      expect(mockDeleteMany).toHaveBeenCalledWith({ documentId: 'doc123' });
    });

    it('handles DB errors', async (): Promise<void> => {
      mockDeleteMany.mockRejectedValue(new Error('DB error'));
      await expect(documentProcessor.deleteDocumentChunks('doc123')).rejects.toThrow(HttpError);
    });
  });

  describe('getDocumentChunks', (): void => {
    it('retrieves chunks for a document', async (): Promise<void> => {
      const mockChunks = [
        { _id: 'c1', documentId: 'doc123', content: 'First', chunkIndex: 0 },
        { _id: 'c2', documentId: 'doc123', content: 'Second', chunkIndex: 1 }
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(mockChunks) })
      });

      const result = await documentProcessor.getDocumentChunks('doc123');

      expect(result).toEqual(mockChunks);
      expect(mockFind).toHaveBeenCalledWith({ documentId: 'doc123' });
    });
  });

  describe('getStatistics', (): void => {
    it('returns statistics', async (): Promise<void> => {
      mockCountDocuments.mockResolvedValue(10);
      mockDistinct.mockResolvedValue(['doc1', 'doc2']);

      const result = await documentProcessor.getStatistics();

      expect(result).toEqual({ totalChunks: 10, totalDocuments: 2 });
      expect(mockCountDocuments).toHaveBeenCalled();
      expect(mockDistinct).toHaveBeenCalledWith('documentId');
    });
  });
});
