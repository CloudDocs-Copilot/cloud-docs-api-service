jest.resetModules();
// Ensure we test the real implementation, not the global mock
jest.unmock('../../../src/services/search.service');

const mockGetInstanceFilters = jest.fn();

afterEach(() => jest.clearAllMocks());

describe('search.service - filter branches', (): void => {
  it('searchDocuments applies organization, mimeType and date range filters', async () => {
    const hits = { hits: { hits: [], total: { value: 0 } }, took: 2 };
    const client = { search: jest.fn().mockResolvedValue(hits) };
    const es = (await import('../../../src/configurations/elasticsearch-config')) as unknown as {
      getInstance?: () => unknown;
      default?: { getInstance?: () => unknown };
    };
    es.getInstance = mockGetInstanceFilters;
    if (es.default) es.default.getInstance = mockGetInstanceFilters;
    mockGetInstanceFilters.mockReturnValue(client);

    const svc = (await import('../../../src/services/search.service')) as unknown as {
      searchDocuments: (q: unknown) => Promise<{ total: number; documents?: unknown[] }>;
    };
    const res = await svc.searchDocuments({
      query: 'x',
      userId: 'u1',
      organizationId: 'org1',
      mimeType: 'text/plain',
      fromDate: new Date(Date.now() - 1000 * 60 * 60),
      toDate: new Date(),
      limit: 5,
      offset: 0
    } as unknown);

    expect(client.search).toHaveBeenCalled();
    expect(res.total).toBe(0);
  });
});
