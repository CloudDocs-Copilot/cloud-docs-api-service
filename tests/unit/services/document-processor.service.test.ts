/**
 * Unit tests for Document Processor Service (updated to match current API)
 */

import { documentProcessor } from '../../../src/services/document-processor.service';
import { embeddingService } from '../../../src/services/ai/embedding.service';
import { getDb } from '../../../src/configurations/database-config/mongoAtlas';
import { splitIntoChunks } from '../../../src/utils/chunking.util';
import HttpError from '../../../src/models/error.model';

// Mocks
jest.mock('../../../src/services/ai/embedding.service');
jest.mock('../../../src/configurations/database-config/mongoAtlas');
jest.mock('../../../src/utils/chunking.util');

describe('DocumentProcessor (updated)', () => {
  let mockCollection: any;
  let mockInsertMany: jest.Mock;
  let mockDeleteMany: jest.Mock;
  let mockFind: jest.Mock;
  let mockAggregate: jest.Mock;
  let mockCountDocuments: jest.Mock;
  let mockDistinct: jest.Mock;

  beforeEach(() => {
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

    (getDb as jest.Mock).mockResolvedValue({
      collection: jest.fn().mockReturnValue(mockCollection)
    });
  });

  describe('processDocument', () => {
    it('processes text and stores chunks', async () => {
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

    it('throws on empty text', async () => {
      await expect(documentProcessor.processDocument('doc123', 'org123', '')).rejects.toThrow(HttpError);
    });

    it('handles embedding generation errors', async () => {
      const text = 'Some content';
      (splitIntoChunks as jest.Mock).mockReturnValue(['Some content']);
      (embeddingService.generateEmbeddings as jest.Mock).mockRejectedValue(new Error('API error'));

      await expect(documentProcessor.processDocument('doc123', 'org123', text)).rejects.toThrow(HttpError);
    });
  });

  describe('deleteDocumentChunks', () => {
    it('deletes chunks and returns number deleted', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 5 });

      const result = await documentProcessor.deleteDocumentChunks('doc123');

      expect(result).toBe(5);
      expect(mockDeleteMany).toHaveBeenCalledWith({ documentId: 'doc123' });
    });

    it('handles DB errors', async () => {
      mockDeleteMany.mockRejectedValue(new Error('DB error'));
      await expect(documentProcessor.deleteDocumentChunks('doc123')).rejects.toThrow(HttpError);
    });
  });

  describe('getDocumentChunks', () => {
    it('retrieves chunks for a document', async () => {
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

  describe('getStatistics', () => {
    it('returns statistics', async () => {
      mockCountDocuments.mockResolvedValue(10);
      mockDistinct.mockResolvedValue(['doc1', 'doc2']);

      const result = await documentProcessor.getStatistics();

      expect(result).toEqual({ totalChunks: 10, totalDocuments: 2 });
      expect(mockCountDocuments).toHaveBeenCalled();
      expect(mockDistinct).toHaveBeenCalledWith('documentId');
    });
  });
});
