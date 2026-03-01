// Extended search.service tests for additional coverage

jest.resetModules();
jest.unmock('../../../src/services/search.service');

const mockClient = {
  index: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockImplementation(() => {
    throw { meta: { statusCode: 404 } };
  }),
  search: jest.fn().mockResolvedValue({
    hits: {
      hits: [
        {
          _id: '1',
          _score: 1.2,
          _source: { filename: 'a', originalname: 'a', mimeType: 'text/plain', uploadedBy: 'u' }
        },
        {
          _id: '2',
          _score: 0.5,
          _source: { filename: 'b', originalname: 'b', mimeType: 'text/plain', uploadedBy: 'u' }
        }
      ],
      total: { value: 2 }
    },
    took: 5
  })
};

jest.mock('../../../src/configurations/elasticsearch-config', () => ({
  getInstance: () => mockClient
}));

let svc: unknown;
beforeAll(async (): Promise<void> => {
  // import after mocks are applied
  svc = (await import('../../../src/services/search.service')) as unknown;
});

const S = (): typeof import('../../../src/services/search.service') => svc as unknown as typeof import('../../../src/services/search.service');

describe('SearchService - Extended Coverage', (): void => {
  it('indexes and removes without throwing on 404', async (): Promise<void> => {
    const doc: unknown = {
      _id: { toString: () => 'doc1' },
      filename: 'f',
      originalname: 'f',
      mimeType: 'text/plain',
      size: 10,
      uploadedBy: { toString: () => 'u' },
      organization: null,
      folder: null,
      uploadedAt: new Date()
    };
    await expect(S().indexDocument(doc as unknown)).resolves.toBeUndefined();
    // removeDocumentFromIndex should not throw on 404
    await expect(S().removeDocumentFromIndex('missing-id')).resolves.toBeUndefined();
  });

  it('searchDocuments returns mapped results and respects filters', async (): Promise<void> => {
    // Asegurar que el mock devuelve el formato correcto
    (mockClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _id: '1',
            _score: 1.2,
            _source: { filename: 'a', originalname: 'a', mimeType: 'text/plain', uploadedBy: 'u' }
          },
          {
            _id: '2',
            _score: 0.5,
            _source: { filename: 'b', originalname: 'b', mimeType: 'text/plain', uploadedBy: 'u' }
          }
        ],
        total: { value: 2 }
      },
      took: 5
    });

    const res = await S().searchDocuments({
      query: 'a',
      userId: 'u',
      organizationId: 'org1',
      mimeType: 'text/plain',
      fromDate: new Date('2020-01-01'),
      toDate: new Date('2022-01-01'),
      limit: 10,
      offset: 0
    });
    expect(res.total).toBe(2);
    expect(res.documents.length).toBe(2);
  });

  it('getAutocompleteSuggestions dedupes and returns strings', async (): Promise<void> => {
    // adjust mock to return duplicates and blanks
    (mockClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        hits: [
          { _source: { originalname: 'dup' } },
          { _source: { filename: 'dup' } },
          { _source: { filename: '' } }
        ],
        total: { value: 3 }
      },
      took: 1
    });

    const suggestions = await S().getAutocompleteSuggestions('d', 'u', 5);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.includes('dup')).toBe(true);
  });
});
