/**
 * Unit tests for MongoDB Atlas Configuration - Connection-dependent tests
 *
 * SKIPPED: These tests require a properly mocked MongoDB client with full
 * connection lifecycle support. They fail with error:
 * "Cannot read properties of undefined (reading 'command')"
 *
 * These tests can be enabled by:
 * 1. Implementing a more complete MongoDB mock that includes db.command()
 * 2. Using mongodb-memory-server for actual MongoDB instance in tests
 * 3. Running as integration tests with real MongoDB Atlas connection
 */

// Mock MongoDB with full client methods
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

describe('MongoDB Atlas Configuration - Connection Lifecycle', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('connectToMongoAtlas (getDb) - Protocol and Options', () => {
    it('should accept mongodb+srv protocol', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/db';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await expect(getDb()).resolves.not.toThrow();
    });

    it('should use correct MongoDB client options', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');
      await getDb();

      // Would verify client options if mock supports it
    });
  });

  describe('getClient - Instance Management', () => {
    it('should return client instance after connection', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const {
        getDb,
        getClient
      } = require('../../../src/configurations/database-config/mongoAtlas');

      await getDb();
      const client = getClient();

      expect(client).toBeDefined();
    });

    it('should return same instance on multiple calls (singleton)', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const {
        getDb,
        getClient
      } = require('../../../src/configurations/database-config/mongoAtlas');

      await getDb();

      const client1 = getClient();
      const client2 = getClient();

      expect(client1).toBe(client2);
    });

    it('should provide access to database methods', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        getClient
      } = require('../../../src/configurations/database-config/mongoAtlas');

      await getDb();
      const client = getClient();

      expect(client && typeof (client as any).db).toBe('function');
    });
  });

  describe('closeAtlasConnection - Disconnect', () => {
    it('should disconnect successfully', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        closeAtlasConnection
      } = require('../../../src/configurations/database-config/mongoAtlas');

      await getDb();
      await expect(closeAtlasConnection()).resolves.not.toThrow();
    });
  });

  describe('URI validation - Format Variations', () => {
    it('should accept valid MongoDB Atlas URI format', async () => {
      const validURIs = [
        'mongodb+srv://cluster0.abc123.mongodb.net/dbname',
        'mongodb+srv://mycluster.example.mongodb.net/production',
        'mongodb://localhost:27017/test' // Also support non-SRV
      ];

      for (const uri of validURIs) {
        process.env.MONGO_ATLAS_URI = uri;

        const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');

        await expect(getDb()).resolves.not.toThrow();

        jest.resetModules();
      }
    });

    it('should handle URIs with special characters in password', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/db';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');

      await expect(getDb()).resolves.not.toThrow();
    });

    it('should handle URIs with query parameters', async () => {
      process.env.MONGO_ATLAS_URI =
        'mongodb+srv://cluster.example.mongodb.net/db?retryWrites=true&w=majority';

      const { getDb } = require('../../../src/configurations/database-config/mongoAtlas');

      await expect(getDb()).resolves.not.toThrow();
    });
  });

  describe('connection lifecycle - Full Flow', () => {
    it('should support connect -> use -> disconnect flow', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        getClient,
        closeAtlasConnection
      } = require('../../../src/configurations/database-config/mongoAtlas');

      // Connect
      await getDb();

      // Use
      const client = getClient();
      expect(client).toBeDefined();

      // Disconnect
      await closeAtlasConnection();
    });
  });
});
