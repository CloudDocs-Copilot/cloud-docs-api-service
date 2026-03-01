/**
 * Unit tests for AI Controller
 */

// Prevent native pdf bindings from loading during tests
jest.mock('pdf-parse', () => ({ __esModule: true, default: jest.fn() }));

import { Request, Response } from 'express';
import * as aiController from '../../../src/controllers/ai.controller';
import { ragService } from '../../../src/services/ai/rag.service';
import { documentProcessor } from '../../../src/services/document-processor.service';
import { textExtractionService } from '../../../src/services/ai/text-extraction.service';
import DocumentModel from '../../../src/models/document.model';
import { hasActiveMembership } from '../../../src/services/membership.service';
import HttpError from '../../../src/models/error.model';

// Mock dependencies
jest.mock('../../../src/services/ai/rag.service');
jest.mock('../../../src/services/document-processor.service');
jest.mock('../../../src/services/ai/text-extraction.service');
jest.mock('../../../src/models/document.model');
jest.mock('../../../src/services/membership.service');

/**
 * Helper function to create a chainable mock for DocumentModel.findById
 * that supports .select('+extractedText')
 */
function mockFindByIdWithSelect(document: unknown) {
  return {
    select: jest.fn().mockResolvedValue(document as unknown)
  };
}

describe('AI Controller', (): void => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<(err?: unknown) => void>;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user123', email: 'test@example.com' },
      body: {},
      params: {}
    } as Partial<Request>;

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

    jest.clearAllMocks();
  });

  describe('askQuestion', (): void => {
    it('should answer a question using RAG', async (): Promise<void> => {
      mockReq.body = {
        question: 'What is AI?',
        organizationId: 'org123'
      };

      const mockResult = {
        answer: 'AI is artificial intelligence.',
        chunks: [{ text: 'Context chunk', chunkIndex: 0 }],
        sources: [],
        usage: { totalTokens: 100 }
      };

      (ragService.answerQuestion as jest.Mock).mockResolvedValue(mockResult);
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult
      });
    });

    it('should return 400 if question is missing', async (): Promise<void> => {
      mockReq.body = { organizationId: 'org123' };

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should return 400 if organizationId is missing', async (): Promise<void> => {
      mockReq.body = { question: 'Test?' };

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should return 403 if user is not member of organization', async (): Promise<void> => {
      mockReq.body = {
        question: 'Test?',
        organizationId: 'org123'
      };

      (hasActiveMembership as jest.Mock).mockResolvedValue(false);

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should handle RAG service errors', async (): Promise<void> => {
      mockReq.body = {
        question: 'Test?',
        organizationId: 'org123'
      };

      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (ragService.answerQuestion as jest.Mock).mockRejectedValue(new Error('RAG service failed'));

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle empty question', async (): Promise<void> => {
      mockReq.body = {
        question: '',
        organizationId: 'org123'
      };

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should trim whitespace from question', async (): Promise<void> => {
      mockReq.body = {
        question: '  What is AI?  ',
        organizationId: 'org123'
      };

      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (ragService.answerQuestion as jest.Mock).mockResolvedValue({
        answer: 'Test answer',
        chunks: [],
        sources: []
      });

      await aiController.askQuestion(mockReq as Request, mockRes as Response, mockNext);

      expect(ragService.answerQuestion).toHaveBeenCalledWith('  What is AI?  ', 'org123');
    });
  });

  describe('askQuestionInDocument', (): void => {
    it('should answer question about specific document', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { question: 'What does this document say?' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'user123'
      };

      const mockResult = {
        answer: 'The document says...',
        documentId: '60a7c0c5f1d2a3b4c5d6e7f8',
        chunks: []
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (ragService.answerQuestionInDocument as jest.Mock).mockResolvedValue(mockResult);

      await aiController.askQuestionInDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult
      });
    });

    it('should return 400 if question is missing', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = {};

      await aiController.askQuestionInDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should return 404 if document not found', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { question: 'Test?' };
      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(null));

      await aiController.askQuestionInDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should return 403 if user has no access to document', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { question: 'Test?' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'other-user'
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(false);

      await aiController.askQuestionInDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('processDocument', (): void => {
    it('should process document with text content', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { text: 'Document text content here' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'user123',
        mimeType: 'text/plain',
        path: '/path/to/file.txt'
      };

      const mockResult = {
        documentId: '60a7c0c5f1d2a3b4c5d6e7f8',
        chunksCreated: 5,
        totalCharacters: 100,
        totalWords: 20
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (documentProcessor.processDocument as jest.Mock).mockResolvedValue(mockResult);

      await aiController.processDocument(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining(mockResult)
        })
      );
    });

    it('should return 400 if text content is missing', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = {};

      await aiController.processDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should return 400 if text content is empty', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { text: '' };

      await aiController.processDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should handle processing errors', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };
      mockReq.body = { text: 'Test content' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'user123'
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (documentProcessor.processDocument as jest.Mock).mockRejectedValue(
        new Error('Processing failed')
      );

      await aiController.processDocument(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('deleteDocumentChunks', (): void => {
    it('should delete document chunks', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'user123'
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (documentProcessor.deleteDocumentChunks as jest.Mock).mockResolvedValue(5);

      await aiController.deleteDocumentChunks(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { deletedCount: 5 }
        })
      );
    });

    it('should return 404 if document not found', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(null));

      await aiController.deleteDocumentChunks(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('extractDocumentText', (): void => {
    it('should extract text from document', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };

      const mockDoc = {
        _id: '60a7c0c5f1d2a3b4c5d6e7f8',
        organization: 'org123',
        uploadedBy: 'user123',
        path: '/path/to/file.pdf',
        mimeType: 'application/pdf'
      };

      const mockExtraction = {
        text: 'Extracted text from PDF',
        charCount: 23,
        wordCount: 4,
        mimeType: 'application/pdf'
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (textExtractionService.isSupportedMimeType as jest.Mock).mockReturnValue(true);
      (textExtractionService.getSupportedMimeTypes as jest.Mock).mockReturnValue([
        'application/pdf'
      ]);
      (textExtractionService.extractText as jest.Mock).mockResolvedValue(mockExtraction);

      await aiController.extractDocumentText(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockExtraction
        })
      );
    });

    it('should handle extraction errors', async (): Promise<void> => {
      mockReq.params = { documentId: '60a7c0c5f1d2a3b4c5d6e7f8' };

      const mockDoc = {
        _id: 'doc123',
        organization: 'org123',
        uploadedBy: 'user123',
        path: '/path/to/file.pdf',
        mimeType: 'application/pdf'
      };

      (DocumentModel.findById as jest.Mock).mockReturnValue(mockFindByIdWithSelect(mockDoc));
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (textExtractionService.extractText as jest.Mock).mockRejectedValue(
        new Error('Failed to extract text')
      );

      await aiController.extractDocumentText(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
