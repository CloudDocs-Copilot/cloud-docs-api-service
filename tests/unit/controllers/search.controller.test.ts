import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../src/middlewares/auth.middleware';
import * as searchController from '../../../src/controllers/search.controller';
import * as searchService from '../../../src/services/search.service';
import HttpError from '../../../src/models/error.model';

jest.mock('../../../src/services/search.service');

describe('SearchController', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      user: { id: 'user123', email: 'test@example.com', name: 'Test' } as any,
      query: {}
    };
    mockRes = {
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should return 400 when q parameter is missing', async () => {
      mockReq.query = {};

      await searchController.search(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Query parameter "q" is required' })
      );
    });

    it('should return 400 when q parameter is not a string', async () => {
      mockReq.query = { q: 123 as any };

      await searchController.search(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should call searchDocuments with correct params', async () => {
      mockReq.query = { q: 'test query', limit: '10', offset: '5' };
      (searchService.searchDocuments as jest.Mock).mockResolvedValue({
        documents: [],
        total: 0,
        took: 10
      });

      await searchController.search(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(searchService.searchDocuments).toHaveBeenCalledWith({
        query: 'test query',
        userId: 'user123',
        organizationId: undefined,
        mimeType: undefined,
        fromDate: undefined,
        toDate: undefined,
        limit: 10,
        offset: 5
      });
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should handle errors and call next with HttpError', async () => {
      mockReq.query = { q: 'test' };
      (searchService.searchDocuments as jest.Mock).mockRejectedValue(new Error('Search failed'));

      await searchController.search(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    });
  });

  describe('autocomplete', () => {
    it('should return 400 when q parameter is missing', async () => {
      mockReq.query = {};

      await searchController.autocomplete(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Query parameter "q" is required' })
      );
    });

    it('should call getAutocompleteSuggestions with correct params', async () => {
      mockReq.query = { q: 'test', limit: '3' };
      (searchService.getAutocompleteSuggestions as jest.Mock).mockResolvedValue(['test1', 'test2']);

      await searchController.autocomplete(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(searchService.getAutocompleteSuggestions).toHaveBeenCalledWith('test', 'user123', 3);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        suggestions: ['test1', 'test2']
      });
    });

    it('should handle errors and call next with HttpError', async () => {
      mockReq.query = { q: 'test' };
      (searchService.getAutocompleteSuggestions as jest.Mock).mockRejectedValue(
        new Error('Failed')
      );

      await searchController.autocomplete(mockReq as AuthRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });
});
