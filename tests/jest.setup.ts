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
  // Suppress known noisy messages from Elasticsearch/indexing and search
  if (
    msg.includes('Error indexing document') ||
    msg.includes('Failed to index document in search') ||
    msg.includes('Elasticsearch client initialized') ||
    msg.includes('Elasticsearch cluster status') ||
    msg.includes('Error creating Elasticsearch index')
  ) {
    return; // suppress in tests
  }
  originalConsoleError(...args);
};

// Mock email service to avoid real SMTP attempts during tests
jest.mock('../src/mail/emailService', () => ({
  sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mock Elasticsearch configuration/client to avoid network calls and init logs
jest.mock('../src/configurations/elasticsearch-config', () => {
  const mockClient = {
    getInstance: jest.fn(() => ({
      cluster: { health: jest.fn().mockResolvedValue({ status: 'green' }) },
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue(undefined),
      },
      index: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      search: jest.fn().mockResolvedValue({ body: { hits: { hits: [], total: 0 }, took: 1 } })
    })),
    checkConnection: jest.fn().mockResolvedValue(true),
    createDocumentIndex: jest.fn().mockResolvedValue(undefined)
  };

  return { __esModule: true, default: mockClient };
});
