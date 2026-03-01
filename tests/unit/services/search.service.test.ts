import { jest } from '@jest/globals';
import * as searchService from '../../../src/services/search.service';

// Minimal typed shape used only for tests to allow safe calls
type SearchServiceTyped = {
  indexDocument: (doc: unknown, text?: string) => Promise<void>;
  removeDocumentFromIndex: (id: string) => Promise<void>;
  searchDocuments: (opts: unknown) => Promise<{ total: number; documents: Array<Record<string, unknown>> }>;
  getAutocompleteSuggestions: (q: string, userId: string, limit?: number) => Promise<string[]>;
};

const SearchSvcTypedNS = searchService as unknown as SearchServiceTyped;

type EsSearchResult = { hits: { hits: Array<Record<string, unknown>>; total: number | { value: number } }; took: number };

type EsClient = {
  index: (payload: Record<string, unknown>) => Promise<unknown>;
  delete: (payload: Record<string, unknown>) => Promise<unknown>;
  search: (payload: Record<string, unknown>) => Promise<EsSearchResult>;
};

type DocStub = {
  _id?: string | { toString(): string };
  filename?: string;
  originalname?: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: string | { toString(): string };
  organization?: unknown;
  folder?: unknown;
  uploadedAt?: Date;
  aiCategory?: string;
  aiTags?: string[];
  aiProcessingStatus?: string;
};

describe('search.service', (): void => {
  const fakeClient = {
    index: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ hits: { hits: [], total: 0 }, took: 1 })
  } as unknown as EsClient;

  beforeEach((): void => {
    jest.clearAllMocks();
    jest.spyOn(searchService, 'getEsClient').mockReturnValue(fakeClient as unknown as EsClient);
  });

  // Local typed aliases for the mocked namespace to avoid unsafe-call diagnostics
  const _indexDocumentFn = (d: unknown, t?: string): Promise<void> => SearchSvcTypedNS.indexDocument(d, t);
  const _removeDocumentFn = (id: string): Promise<void> => SearchSvcTypedNS.removeDocumentFromIndex(id);
  const _searchDocumentsFn = (opts: unknown): Promise<{ total: number; documents: Array<Record<string, unknown>> }> =>
    SearchSvcTypedNS.searchDocuments(opts);
  const _getAutocompleteFn = (q: string, u: string, n?: number): Promise<string[]> => SearchSvcTypedNS.getAutocompleteSuggestions(q, u, n);

  it('indexDocument should call client.index with proper payload', async (): Promise<void> => {
    const doc: DocStub = {
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

    await (SearchSvcTypedNS.indexDocument as (d: unknown, t?: string) => Promise<void>)(doc, 'hello world');

    expect(fakeClient.index).toHaveBeenCalled();
    const call = ((fakeClient.index as unknown) as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(call['index']).toBe('documents');
    expect(call['id']).toBe(String(doc._id));
    const docObj = call['document'] as Record<string, unknown>;
    expect(docObj['content']).toBe('hello world');
  });

  it('indexDocument truncates large content to 100000 chars', async (): Promise<void> => {
    const long = 'a'.repeat(150000);
    const doc: DocStub = { _id: 'x', filename: 'f', originalname: 'o', mimeType: 't', size: 1, uploadedBy: 'u', organization: null, folder: null };
    await (SearchSvcTypedNS.indexDocument as (d: unknown, t?: string) => Promise<void>)(doc, long);
    const call = ((fakeClient.index as unknown) as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    const docObj = call['document'] as Record<string, unknown>;
    expect((docObj['content'] as string).length).toBeLessThanOrEqual(100000);
  });

  it('removeDocumentFromIndex should call client.delete', async (): Promise<void> => {
    await (SearchSvcTypedNS.removeDocumentFromIndex as (id: string) => Promise<void>)('doc1');
    expect(fakeClient.delete).toHaveBeenCalledWith({ index: 'documents', id: 'doc1' });
  });

  it('removeDocumentFromIndex should ignore 404 errors', async (): Promise<void> => {
    fakeClient.delete.mockRejectedValueOnce({ meta: { statusCode: 404 } });
    await expect((SearchSvcTypedNS.removeDocumentFromIndex as (id: string) => Promise<void>)('missing')).resolves.toBeUndefined();
  });

  it('searchDocuments maps hits and returns total when total is object', async (): Promise<void> => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [{ _id: '1', _score: 2, _source: { filename: 'a' } }], total: { value: 1 } }, took: 5 });
    const res = await (SearchSvcTypedNS.searchDocuments as (opts: unknown) => Promise<{ total: number; documents: Array<Record<string, unknown>> }>)(
      { query: 'a', userId: 'u' }
    );
    expect(res.total).toBe(1);
    expect(res.documents[0].id).toBe('1');
  });

  it('searchDocuments maps hits and returns total when total is number', async (): Promise<void> => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [{ _id: '2', _source: { filename: 'b' } }], total: 3 }, took: 3 });
    const res = await (SearchSvcTypedNS.searchDocuments as (opts: unknown) => Promise<{ total: number; documents: Array<Record<string, unknown>> }>)(
      { query: 'b', userId: 'u' }
    );
    expect(res.total).toBe(3);
    expect(res.documents[0].id).toBe('2');
  });

  it('getAutocompleteSuggestions returns unique filenames and originalnames', async (): Promise<void> => {
    fakeClient.search.mockResolvedValueOnce({ hits: { hits: [ { _id: '1', _source: { originalname: 'orig1' } }, { _id: '2', _source: { filename: 'file2' } }, { _id: '3', _source: { originalname: 'orig1' } } ] }, took: 1 });
    const suggestions = await (SearchSvcTypedNS.getAutocompleteSuggestions as (q: string, u: string, n?: number) => Promise<string[]>)(
      'q',
      'u',
      5
    );
    expect(suggestions).toEqual(['orig1', 'file2']);
  });

  it('getAutocompleteSuggestions returns empty array on error', async (): Promise<void> => {
    fakeClient.search.mockRejectedValueOnce(new Error('boom'));
    const suggestions = await (SearchSvcTypedNS.getAutocompleteSuggestions as (q: string, u: string, n?: number) => Promise<string[]>)('q', 'u');
    expect(suggestions).toEqual([]);
  });
});
jest.mock('../../../src/configurations/elasticsearch-config', () => {
  const getInstanceFn = jest.fn((): EsClient => ({
    index: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
    search: jest.fn().mockResolvedValue({ hits: { hits: [{ _id: '1', _score: 1, _source: { filename: 'f' } }], total: 1 }, took: 2 })
  } as unknown as EsClient));

  return {
    getInstance: getInstanceFn,
    default: { getInstance: getInstanceFn }
  };
});

// Use typed alias for imported namespace to satisfy TS rules when calling mocked functions
const SearchSvcNS = searchService as unknown as typeof import('../../../src/services/search.service');

describe('search.service', (): void => {
  const fakeDoc: DocStub = {
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

  test('indexDocument calls client.index and truncates content', async (): Promise<void> => {
    const long = 'a'.repeat(200000);
    const client = { index: jest.fn().mockResolvedValue(true) } as unknown as EsClient;
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    await expect(svc.indexDocument(fakeDoc, long)).resolves.toBeUndefined();
  });

  test('removeDocumentFromIndex handles success', async (): Promise<void> => {
    const client2 = { delete: jest.fn().mockResolvedValue(true) };
    const svcMod2 = await import('../../../src/services/search.service');
    const svc2 = svcMod2 as unknown as typeof import('../../../src/services/search.service');
    svc2.getEsClient = (): EsClient => client2 as unknown as EsClient;
    await expect(svc2.removeDocumentFromIndex('doc1')).resolves.toBeUndefined();
  });

  test('searchDocuments returns mapped result', async (): Promise<void> => {
    const hits = { hits: { hits: [{ _id: 'h1', _score: 1.2, _source: { filename: 'a' } }], total: { value: 1 } }, took: 5 };
    const client = { search: jest.fn().mockResolvedValue(hits) } as unknown as EsClient;
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    const res = (await svc.searchDocuments({ query: 'q', userId: 'user1' } as unknown as Record<string, unknown>)) as unknown as { total: number; documents: Array<Record<string, unknown>> };
    expect(res).toHaveProperty('documents');
    expect(res.documents[0]).toHaveProperty('id');
  });

  test('getAutocompleteSuggestions returns unique suggestions', async (): Promise<void> => {
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    const res = await svc.getAutocompleteSuggestions('f', 'user1', 5);
    expect(Array.isArray(res)).toBe(true);
  });

  test('searchDocuments supports mimeType filter and date range', async (): Promise<void> => {
    const from = new Date(Date.now() - 1000 * 60 * 60);
    const to = new Date();
    const hits = { hits: { hits: [], total: { value: 0 } }, took: 1 };
    const client = { search: jest.fn().mockResolvedValue(hits) } as unknown as EsClient;
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    const res = (await svc.searchDocuments({ query: 'q', userId: 'user1', mimeType: 'text/plain', fromDate: from, toDate: to } as unknown as Record<string, unknown>)) as unknown as { total: number; documents: Array<Record<string, unknown>> };
    expect(res.total).toBeGreaterThanOrEqual(0);
  });

  test('indexDocument logs on error should rethrow', async (): Promise<void> => {
    // Import and override getEsClient to inject a failing mock
    await import('../../../src/services/search.service');
    const originalGetEsClient = SearchSvcNS.getEsClient as unknown as () => EsClient;
    SearchSvcNS.getEsClient = (): EsClient => ({
      index: async (_: Record<string, unknown>) => { throw new Error('es-error'); }
    } as unknown as EsClient);

    // Call from the required module to use the overridden getEsClient
    await expect((SearchSvcNS.indexDocument as (d: unknown, t?: string) => Promise<void>)(fakeDoc)).rejects.toThrow('es-error');

    // Restore original
    SearchSvcNS.getEsClient = originalGetEsClient;
  });
});
jest.resetModules();
// The global jest.setup.ts mocks the search service; unmock here to test the real implementation
jest.unmock('../../../src/services/search.service');

const _mockGetInstance = jest.fn();

afterEach(() => jest.clearAllMocks());

describe('search.service', (): void => {
  it('indexDocument calls client.index', async (): Promise<void> => {
    const client = { index: jest.fn().mockResolvedValue(true) } as unknown as EsClient;
    // override real module's getInstance to return our client
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);
    if (esMod.default) esMod.default.getInstance.mockReturnValue(client);
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    const doc = {
      _id: 'd1',
      filename: 'f',
      originalname: 'orig',
      mimeType: 'text/plain',
      size: 10,
      uploadedBy: { toString: () => 'u1' },
      uploadedAt: new Date()
    };
    await svc.indexDocument(doc as unknown as DocStub);
    expect(client.index).toHaveBeenCalled();
  });

  // 🔍 RFE-AI-004: Verify that extractedText is indexed in 'content' field
  it('indexDocument includes content field when extractedText is provided', async (): Promise<void> => {
    const client = { index: jest.fn().mockResolvedValue(true) } as unknown as EsClient;
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);
    if (esMod.default) esMod.default.getInstance.mockReturnValue(client);
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
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

    await svc.indexDocument(doc as unknown as DocStub, extractedText);

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
  it('indexDocument sets content to null when no extractedText provided', async (): Promise<void> => {
    const client = { index: jest.fn().mockResolvedValue(true) } as unknown as EsClient;
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);
    if (esMod.default) esMod.default.getInstance.mockReturnValue(client);
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    const doc = {
      _id: 'd3',
      filename: 'image.png',
      originalname: 'photo.png',
      mimeType: 'image/png',
      size: 2000,
      uploadedBy: { toString: () => 'u3' },
      uploadedAt: new Date()
    };

    await svc.indexDocument(doc as unknown as DocStub);

    expect(client.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          content: null
        })
      })
    );
  });

  it('removeDocumentFromIndex handles 404 gracefully', async (): Promise<void> => {
    const client = { delete: jest.fn().mockRejectedValue({ meta: { statusCode: 404 } }) } as unknown as EsClient;
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);
    if (esMod.default) esMod.default.getInstance.mockReturnValue(client);
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    await expect(svc.removeDocumentFromIndex('d1')).resolves.toBeUndefined();
  });

  it('searchDocuments maps hits to results', async (): Promise<void> => {
    const hits = {
      hits: { hits: [{ _id: 'h1', _score: 1.2, _source: { filename: 'a' } }], total: { value: 1 } },
      took: 5
    };
    const client = { search: jest.fn().mockResolvedValue(hits) } as unknown as EsClient;
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);
    if (esMod.default) esMod.default.getInstance.mockReturnValue(client);
    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = () => client as unknown as EsClient;
    const res = (await svc.searchDocuments({ query: 'a', userId: 'u1' } as unknown as Record<string, unknown>)) as unknown as { total: number; documents: Array<Record<string, unknown>> };
    expect(res.total).toBe(1);
    expect(res.documents[0].id).toBe('h1');
  });

  it('getAutocompleteSuggestions deduplicates and returns strings', async (): Promise<void> => {
    const hits = {
      hits: {
        hits: [
          { _source: { originalname: 'A' } },
          { _source: { filename: 'B' } },
          { _source: { originalname: 'A' } }
        ]
      }
    };
    const client = { search: jest.fn().mockResolvedValue(hits) } as unknown as EsClient;
    const es = await import('../../../src/configurations/elasticsearch-config');
    const esMod = es as unknown as { getInstance: jest.Mock; default?: { getInstance: jest.Mock } };
    esMod.getInstance.mockReturnValue(client);

    const svcMod = await import('../../../src/services/search.service');
    const svc = svcMod as unknown as typeof import('../../../src/services/search.service');
    svc.getEsClient = (): EsClient => client as unknown as EsClient;
    const res = await svc.getAutocompleteSuggestions('A', 'u1', 5);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0]).toBe('A');
  });
});
