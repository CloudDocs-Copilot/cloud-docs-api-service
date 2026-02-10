// Global Jest setup for tests
// Mock the search service so tests don't require a running Elasticsearch instance

jest.mock('../src/services/search.service', () => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0, took: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([]),
}));

// Optional: silence noisy logs from Elasticsearch config during tests
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = String(args[0] || '');
  if (msg.includes('Error indexing document') || msg.includes('Failed to index document in search')) {
    return; // suppress in tests
  }
  originalConsoleError(...args);
};
