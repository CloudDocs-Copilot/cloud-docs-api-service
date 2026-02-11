jest.resetModules();
jest.unmock('../../../src/services/search.service');

const mockGetInstance = jest.fn();

afterEach(() => jest.clearAllMocks());

describe('search.service - indexDocument null fields', () => {
  it('indexDocument handles null organization and folder', async () => {
    const client = { index: jest.fn().mockResolvedValue(true) };
    const es = require('../../../src/configurations/elasticsearch-config');
    es.getInstance = mockGetInstance;
    if (es.default) es.default.getInstance = mockGetInstance;
    mockGetInstance.mockReturnValue(client);

    const svc = require('../../../src/services/search.service');
    const doc = { _id: 'd2', filename: 'f2', originalname: 'orig2', mimeType: 'text/plain', size: 5, uploadedBy: { toString: () => 'u2' }, uploadedAt: new Date() };
    await svc.indexDocument(doc as any);
    expect(client.index).toHaveBeenCalled();
  });
});
