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
