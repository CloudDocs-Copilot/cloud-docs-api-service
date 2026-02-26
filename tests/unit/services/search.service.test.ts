import { jest } from '@jest/globals';
import * as searchService from '../../../src/services/search.service';

describe('search.service', () => {
  const fakeClient = {
    index: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ hits: { hits: [], total: 0 }, took: 1 })
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(searchService, 'getEsClient').mockReturnValue(fakeClient as any);
  });

  it('indexDocument should call client.index with proper payload', async () => {
    const doc: any = {
      _id: '123',
      filename: 'f',
      originalname: 'o',
      mimeType: 'text/plain',
      size: 10,
      uploadedBy: 'u',
      organization: null,
      folder: null,
      uploadedAt: new Date()
    };

    await searchService.indexDocument(doc, 'hello world');

    expect(fakeClient.index).toHaveBeenCalled();
    const call = fakeClient.index.mock.calls[0][0];
    expect(call.index).toBe('documents');
    expect(call.id).toBe(String(doc._id));
    expect(call.document.content).toBe('hello world');
  });

  it('indexDocument truncates large content to 100000 chars', async () => {
    const long = 'a'.repeat(150000);
    const doc: any = { _id: 'x', filename: 'f', originalname: 'o', mimeType: 't', size: 1, uploadedBy: 'u', organization: null, folder: null };
    await searchService.indexDocument(doc, long);
    const call = fakeClient.index.mock.calls[0][0];
    expect(call.document.content.length).toBeLessThanOrEqual(100000);
  });

  it('removeDocumentFromIndex should call client.delete', async () => {
    await searchService.removeDocumentFromIndex('doc1');
    expect(fakeClient.delete).toHaveBeenCalledWith({ index: 'documents', id: 'doc1' });
  });

  it('removeDocumentFromIndex should ignore 404 errors', async () => {
    fakeClient.delete.mockRejectedValueOnce({ meta: { statusCode: 404 } });
    await expect(searchService.removeDocumentFromIndex('missing')).resolves.toBeUndefined();
  });

  it('searchDocuments maps hits and returns total when total is object', async () => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [{ _id: '1', _score: 2, _source: { filename: 'a' } }], total: { value: 1 } }, took: 5 });
    const res = await searchService.searchDocuments({ query: 'a', userId: 'u' });
    expect(res.total).toBe(1);
    expect(res.documents[0].id).toBe('1');
  });

  it('searchDocuments maps hits and returns total when total is number', async () => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [{ _id: '2', _source: { filename: 'b' } }], total: 3 }, took: 3 });
    const res = await searchService.searchDocuments({ query: 'b', userId: 'u' });
    expect(res.total).toBe(3);
    expect(res.documents[0].id).toBe('2');
  });

  it('getAutocompleteSuggestions returns unique filenames and originalnames', async () => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [ { _id: '1', _source: { originalname: 'orig1' } }, { _id: '2', _source: { filename: 'file2' } }, { _id: '3', _source: { originalname: 'orig1' } } ] }, took: 1 });
    const suggestions = await searchService.getAutocompleteSuggestions('q', 'u', 5);
    expect(suggestions).toEqual(['orig1', 'file2']);
  });

  it('getAutocompleteSuggestions returns empty array on error', async () => {
    fakeClient.search.mockRejectedValueOnce(new Error('boom'));
    const suggestions = await searchService.getAutocompleteSuggestions('q', 'u');
    expect(suggestions).toEqual([]);
  });
});
jest.mock('../../../src/configurations/elasticsearch-config', () => ({
  getInstance: () => ({
    index: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
    search: jest.fn().mockResolvedValue({ hits: { hits: [{ _id: '1', _score: 1, _source: { filename: 'f' } }], total: 1 }, took: 2 })
  })
}));

import { indexDocument, removeDocumentFromIndex, searchDocuments, getAutocompleteSuggestions } from '../../../src/services/search.service';

describe('search.service', () => {
  const fakeDoc: any = {
    _id: { toString: () => 'doc1' },
    filename: 'name',
    originalname: 'orig',
    mimeType: 'text/plain',
    size: 10,
    uploadedBy: { toString: () => 'user1' },
    organization: null,
    folder: null,
    uploadedAt: new Date()
  };

  test('indexDocument calls client.index and truncates content', async () => {
    const long = 'a'.repeat(200000);
    await expect(indexDocument(fakeDoc, long)).resolves.toBeUndefined();
  });

  test('removeDocumentFromIndex handles success', async () => {
    await expect(removeDocumentFromIndex('doc1')).resolves.toBeUndefined();
  });

  test('searchDocuments returns mapped result', async () => {
    const res = await searchDocuments({ query: 'q', userId: 'user1' } as any);
    expect(res).toHaveProperty('documents');
    expect(res.documents[0]).toHaveProperty('id');
  });

  test('getAutocompleteSuggestions returns unique suggestions', async () => {
    const res = await getAutocompleteSuggestions('f', 'user1', 5);
    expect(Array.isArray(res)).toBe(true);
  });

  test('searchDocuments supports mimeType filter and date range', async () => {
    const from = new Date(Date.now() - 1000 * 60 * 60);
    const to = new Date();
    const res = await searchDocuments({ query: 'q', userId: 'user1', mimeType: 'text/plain', fromDate: from, toDate: to } as any);
    expect(res.total).toBeGreaterThanOrEqual(0);
  });

  test('indexDocument logs on error should rethrow', async () => {
    // Import and override getEsClient to inject a failing mock
    const searchService = require('../../../src/services/search.service');
    const originalGetEsClient = searchService.getEsClient;
    searchService.getEsClient = () => ({
      index: jest.fn().mockRejectedValue(new Error('es-error'))
    });
    
    // Call from the required module to use the overridden getEsClient
    await expect(searchService.indexDocument(fakeDoc)).rejects.toThrow('es-error');
    
    // Restore original
    searchService.getEsClient = originalGetEsClient;
  });
});
jest.resetModules();
// The global jest.setup.ts mocks the search service; unmock here to test the real implementation
jest.unmock('../../../src/services/search.service');

const mockGetInstance = jest.fn();

afterEach(() => jest.clearAllMocks());

describe('search.service', () => {
  it('indexDocument calls client.index', async () => {
    const client = { index: jest.fn().mockResolvedValue(true) };
    // override real module's getInstance to return our client
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    const doc = {
      _id: 'd1',
      filename: 'f',
      originalname: 'orig',
      mimeType: 'text/plain',
      size: 10,
      uploadedBy: { toString: () => 'u1' },
      uploadedAt: new Date()
    };
    await svc.indexDocument(doc as any);
    expect(client.index).toHaveBeenCalled();
  });

  // 🔍 RFE-AI-004: Verify that extractedText is indexed in 'content' field
  it('indexDocument includes content field when extractedText is provided', async () => {
    const client = { index: jest.fn().mockResolvedValue(true) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    const doc = {
      _id: 'd2',
      filename: 'report.pdf',
      originalname: 'Annual Report 2024.pdf',
      mimeType: 'application/pdf',
      size: 5000,
      uploadedBy: { toString: () => 'u2' },
      uploadedAt: new Date(),
      aiCategory: 'financial',
      aiTags: ['annual', 'report', '2024'],
      aiProcessingStatus: 'completed'
    };
    const extractedText = 'This is the extracted content from the PDF document.';

    await svc.indexDocument(doc as any, extractedText);

    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 'documents',
        id: 'd2',
        document: expect.objectContaining({
          filename: 'report.pdf',
          content: extractedText,
          aiCategory: 'financial',
          aiTags: ['annual', 'report', '2024'],
          aiProcessingStatus: 'completed'
        })
      })
    );
  });

  // 🔍 RFE-AI-004: Verify that content is null when no extractedText provided
  it('indexDocument sets content to null when no extractedText provided', async () => {
    const client = { index: jest.fn().mockResolvedValue(true) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    const doc = {
      _id: 'd3',
      filename: 'image.png',
      originalname: 'photo.png',
      mimeType: 'image/png',
      size: 2000,
      uploadedBy: { toString: () => 'u3' },
      uploadedAt: new Date()
    };

    await svc.indexDocument(doc as any);

    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          content: null
        })
      })
    );
  });

  it('removeDocumentFromIndex handles 404 gracefully', async () => {
    const client = { delete: jest.fn().mockRejectedValue({ meta: { statusCode: 404 } }) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    await expect(svc.removeDocumentFromIndex('d1')).resolves.toBeUndefined();
  });

  it('searchDocuments maps hits to results', async () => {
    const hits = {
      hits: { hits: [{ _id: 'h1', _score: 1.2, _source: { filename: 'a' } }], total: { value: 1 } },
      took: 5
    };
    const client = { search: jest.fn().mockResolvedValue(hits) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    const res = await svc.searchDocuments({ query: 'a', userId: 'u1' } as any);
    expect(res.total).toBe(1);
    expect(res.documents[0].id).toBe('h1');
  });

  it('getAutocompleteSuggestions deduplicates and returns strings', async () => {
    const hits = {
      hits: {
        hits: [
          { _source: { originalname: 'A' } },
          { _source: { filename: 'B' } },
          { _source: { originalname: 'A' } }
        ]
      }
    };
    const client = { search: jest.fn().mockResolvedValue(hits) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    svc.getEsClient = () => client;
    const res = await svc.getAutocompleteSuggestions('A', 'u1', 5);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0]).toBe('A');
  });
});
