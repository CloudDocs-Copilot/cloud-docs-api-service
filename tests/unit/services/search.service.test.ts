import * as searchService from '../../../src/services/search.service';
import ElasticsearchClient from '../../../src/configurations/elasticsearch-config';
import { IDocument } from '../../../src/models/document.model';
import mongoose from 'mongoose';

// Mock de Elasticsearch
jest.mock('../../../src/configurations/elasticsearch-config');

describe('Search Service', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      index: jest.fn().mockResolvedValue({ result: 'created' }),
      delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
      search: jest.fn()
    };

    (ElasticsearchClient.getInstance as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('indexDocument', () => {
    it('debe indexar un documento correctamente', async () => {
      const mockDocument = {
        _id: new mongoose.Types.ObjectId(),
        filename: 'test.pdf',
        originalname: 'Test Document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedBy: new mongoose.Types.ObjectId(),
        organization: new mongoose.Types.ObjectId(),
        folder: new mongoose.Types.ObjectId(),
        uploadedAt: new Date()
      } as IDocument;

      await searchService.indexDocument(mockDocument);

      expect(mockClient.index).toHaveBeenCalledWith({
        index: 'documents',
        id: mockDocument._id.toString(),
        document: expect.objectContaining({
          filename: 'test.pdf',
          originalname: 'Test Document.pdf',
          mimeType: 'application/pdf'
        })
      });
    });
  });

  describe('removeDocumentFromIndex', () => {
    it('debe eliminar un documento del índice', async () => {
      const documentId = new mongoose.Types.ObjectId().toString();

      await searchService.removeDocumentFromIndex(documentId);

      expect(mockClient.delete).toHaveBeenCalledWith({
        index: 'documents',
        id: documentId
      });
    });

    it('debe manejar documento no encontrado (404)', async () => {
      const documentId = new mongoose.Types.ObjectId().toString();
      mockClient.delete.mockRejectedValue({
        meta: { statusCode: 404 }
      });

      await expect(searchService.removeDocumentFromIndex(documentId)).resolves.not.toThrow();
    });
  });

  describe('searchDocuments', () => {
    it('debe realizar búsqueda con query_string', async () => {
      const mockResponse = {
        hits: {
          hits: [
            {
              _id: '1',
              _score: 1.5,
              _source: {
                filename: 'test.pdf',
                originalname: 'Test.pdf'
              }
            }
          ],
          total: { value: 1 }
        },
        took: 10
      };

      mockClient.search.mockResolvedValue(mockResponse);

      const result = await searchService.searchDocuments({
        query: 'test',
        userId: new mongoose.Types.ObjectId().toString(),
        organizationId: new mongoose.Types.ObjectId().toString()
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'documents',
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  query_string: expect.objectContaining({
                    query: '*test*',
                    fields: ['filename', 'originalname']
                  })
                })
              ])
            })
          })
        })
      );

      expect(result.documents).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.took).toBe(10);
    });

    it('debe aplicar filtros de organización', async () => {
      mockClient.search.mockResolvedValue({
        hits: { hits: [], total: 0 },
        took: 5
      });

      const orgId = new mongoose.Types.ObjectId().toString();

      await searchService.searchDocuments({
        query: 'test',
        userId: new mongoose.Types.ObjectId().toString(),
        organizationId: orgId
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { organization: orgId } }
              ])
            })
          })
        })
      );
    });

    it('debe aplicar filtro de tipo MIME', async () => {
      mockClient.search.mockResolvedValue({
        hits: { hits: [], total: 0 },
        took: 5
      });

      await searchService.searchDocuments({
        query: 'test',
        userId: new mongoose.Types.ObjectId().toString(),
        mimeType: 'application/pdf'
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { mimeType: 'application/pdf' } }
              ])
            })
          })
        })
      );
    });

    it('debe manejar paginación', async () => {
      mockClient.search.mockResolvedValue({
        hits: { hits: [], total: 0 },
        took: 5
      });

      await searchService.searchDocuments({
        query: 'test',
        userId: new mongoose.Types.ObjectId().toString(),
        limit: 10,
        offset: 20
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 10,
          from: 20
        })
      );
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('debe retornar sugerencias únicas', async () => {
      mockClient.search.mockResolvedValue({
        hits: {
          hits: [
            { _source: { originalname: 'Test.pdf' } },
            { _source: { originalname: 'Test.pdf' } }, // Duplicado
            { _source: { originalname: 'Testing.pdf' } }
          ],
          total: 3
        },
        took: 5
      });

      const suggestions = await searchService.getAutocompleteSuggestions(
        'test',
        new mongoose.Types.ObjectId().toString()
      );

      expect(suggestions).toHaveLength(2); // Sin duplicados
      expect(suggestions).toContain('Test.pdf');
      expect(suggestions).toContain('Testing.pdf');
    });

    it('debe respetar el límite de sugerencias', async () => {
      mockClient.search.mockResolvedValue({
        hits: {
          hits: [
            { _source: { originalname: 'Test1.pdf' } },
            { _source: { originalname: 'Test2.pdf' } },
            { _source: { originalname: 'Test3.pdf' } }
          ],
          total: 3
        },
        took: 5
      });

      const suggestions = await searchService.getAutocompleteSuggestions(
        'test',
        new mongoose.Types.ObjectId().toString(),
        undefined,
        2
      );

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });
});
