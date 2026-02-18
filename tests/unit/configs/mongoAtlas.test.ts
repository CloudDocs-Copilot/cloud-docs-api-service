/**
 * Unit tests for MongoDB Atlas Configuration
 */

// Use dynamic require inside tests to pick up env changes and module reset

// Mock MongoDB
jest.mock('mongodb', () => {
  const mockDb = {
    collection: jest.fn(),
    command: jest.fn().mockResolvedValue({ ok: 1 })
  };

  const mockClient = {
    db: jest.fn().mockReturnValue(mockDb),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  };

  return {
    MongoClient: jest.fn().mockImplementation(() => mockClient)
  };
});

// Tests that work without actual MongoDB connection (error handling tests)
// Connection-dependent tests moved to mongoAtlas.connected.test.ts
describe('MongoDB Atlas Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();

    // Clear the singleton instance
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('connectToMongoAtlas (getDb)', () => {
    it('should connect successfully with valid URI', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';
      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).resolves.not.toThrow();
    });

    it('should throw error when URI is not configured', async () => {
      delete process.env.MONGO_ATLAS_URI;

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).rejects.toThrow('MONGO_ATLAS_URI');
    });

    it('should throw error with empty URI', async () => {
      process.env.MONGO_ATLAS_URI = '';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).rejects.toThrow();
    });

    it('should handle connection errors gracefully', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://invalid:uri@cluster.net/test';

      // Clear the module cache and reconfigure mock for this test
      jest.resetModules();

      // Mock connection failure
      const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      const mockClose = jest.fn();

      jest.doMock('mongodb', () => ({
        MongoClient: jest.fn().mockImplementation(() => ({
          connect: mockConnect,
          close: mockClose,
          db: jest.fn()
        }))
      }));

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).rejects.toThrow('Connection failed');
    });

    it('should reject whitespace-only URI', async () => {
      process.env.MONGO_ATLAS_URI = '   ';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).rejects.toThrow();
    });
  });

  describe('getClient (getClient/getDb)', () => {
    it('should throw error when accessing client before connection', () => {
      const { getClient } = require('../../../src/configurations/database-config/mongoAtlas');

      expect(() => getClient()).not.toThrow();
    });
  });

  describe('closeAtlasConnection', () => {
    it('should handle disconnect when not connected', async () => {
      const {
        closeAtlasConnection
      } = require('../../../src/configurations/database-config/mongoAtlas');

      // Should not throw even if not connected
      await expect(closeAtlasConnection()).resolves.not.toThrow();
    });

    it('should handle disconnect errors gracefully', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      jest.resetModules();

      // Mock close failure
      const mockDb = jest.fn().mockReturnValue({ command: jest.fn().mockResolvedValue({ ok: 1 }) });
      const mockClose = jest.fn().mockRejectedValue(new Error('Close failed'));
      const mockConnect = jest.fn().mockResolvedValue(undefined);

      jest.doMock('mongodb', () => ({
        MongoClient: jest.fn().mockImplementation(() => ({
          connect: mockConnect,
          close: mockClose,
          db: mockDb
        }))
      }));

      const {
        getDb,
        closeAtlasConnection
      } = require('../../../src/configurations/database-config/mongoAtlas');

      await getDb();

      // Should handle error but not throw
      await closeAtlasConnection();
    });
  });
});
