import { searchDocuments, getAutocompleteSuggestions, SearchParams } from '../../../src/services/search.service';
import Document from '../../../src/models/document.model';
import ElasticsearchClient from '../../../src/configurations/elasticsearch-config';

/**
 * Tests para verificar el fallback a MongoDB cuando Elasticsearch no está disponible
 */
jest.mock('../../../src/configurations/elasticsearch-config');
jest.mock('../../../src/models/document.model');

describe('Search Service - Fallback to MongoDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchDocuments', () => {
    it('should use Elasticsearch when available', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockResolvedValue({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: '123',
                _score: 1.5,
                _source: {
                  filename: 'test.pdf',
                  originalname: 'test.pdf',
                  mimeType: 'application/pdf'
                }
              }
            ]
          },
          took: 50
        })
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);

      const params: SearchParams = {
        query: 'test',
        userId: 'user123',
        organizationId: 'org123'
      };

      // Act
      const result = await searchDocuments(params);

      // Assert
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].filename).toBe('test.pdf');
      expect(result.total).toBe(1);
      expect(mockEsClient.search).toHaveBeenCalled();
    });

    it('should fallback to MongoDB when Elasticsearch fails', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockRejectedValue(new Error('ES Connection failed'))
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);

      const mockMongoDocs = [
        {
          _id: { toString: () => '123' },
          filename: 'test.pdf',
          originalname: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          uploadedBy: { toString: () => 'user123' },
          organization: { toString: () => 'org123' },
          folder: { toString: () => 'folder123' },
          uploadedAt: new Date()
        }
      ];

      (Document.countDocuments as jest.Mock).mockResolvedValue(1);
      (Document.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockMongoDocs)
      });

      const params: SearchParams = {
        query: 'test',
        userId: 'user123',
        organizationId: 'org123'
      };

      // Act
      const result = await searchDocuments(params);

      // Assert
      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].filename).toBe('test.pdf');
      expect(result.total).toBe(1);
    });

    it('should throw HttpError when both ES and MongoDB fail', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockRejectedValue(new Error('ES failed'))
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);
      (Document.countDocuments as jest.Mock).mockRejectedValue(new Error('MongoDB failed'));

      const params: SearchParams = {
        query: 'test',
        userId: 'user123'
      };

      // Act & Assert
      await expect(searchDocuments(params)).rejects.toThrow('Error searching documents');
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('should use Elasticsearch when available', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockResolvedValue({
          hits: {
            hits: [
              {
                _score: 1.5,
                _source: {
                  filename: 'report.pdf',
                  originalname: 'Annual Report.pdf'
                }
              }
            ]
          }
        })
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);

      // Act
      const result = await getAutocompleteSuggestions('report', 'user123', 'org123', 5);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Annual Report.pdf');
      expect(mockEsClient.search).toHaveBeenCalled();
    });

    it('should fallback to MongoDB when Elasticsearch fails', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockRejectedValue(new Error('ES Connection failed'))
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);

      const mockMongoDocs = [
        {
          _id: { toString: () => '123' },
          filename: 'report.pdf',
          originalname: 'Annual Report.pdf'
        }
      ];

      (Document.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockMongoDocs)
      });

      // Act
      const result = await getAutocompleteSuggestions('report', 'user123', 'org123', 5);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Annual Report.pdf');
    });

    it('should return empty array when both ES and MongoDB fail', async () => {
      // Arrange
      const mockEsClient = {
        search: jest.fn().mockRejectedValue(new Error('ES failed'))
      };

      (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockEsClient);
      (Document.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('MongoDB failed'))
      });

      // Act
      const result = await getAutocompleteSuggestions('report', 'user123');

      // Assert
      expect(result).toEqual([]);
    });
  });
});
