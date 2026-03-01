jest.resetModules();
jest.unmock('../../../src/services/search.service');

const mockGetInstanceNull = jest.fn();

afterEach((): void => jest.clearAllMocks());

describe('search.service - indexDocument null fields', (): void => {
  it('indexDocument handles null organization and folder', async (): Promise<void> => {
    const client = { index: jest.fn().mockResolvedValue(true) };
    const es = (await import('../../../src/configurations/elasticsearch-config')) as unknown as {
      getInstance?: () => unknown;
      default?: { getInstance?: () => unknown };
    };
    es.getInstance = mockGetInstanceNull;
    if (es.default) es.default.getInstance = mockGetInstanceNull;
    mockGetInstanceNull.mockReturnValue(client);

    const svc = (await import('../../../src/services/search.service')) as unknown as {
      indexDocument: (d: unknown) => Promise<unknown>;
    };
    const doc = {
      _id: 'd2',
      filename: 'f2',
      originalname: 'orig2',
      mimeType: 'text/plain',
      size: 5,
      uploadedBy: { toString: () => 'u2' },
      uploadedAt: new Date()
    };
    const svcModule = svc as unknown as { indexDocument: (d: unknown) => Promise<unknown> };
    await svcModule.indexDocument(doc as unknown);
    expect(client.index).toHaveBeenCalled();
  });
});
