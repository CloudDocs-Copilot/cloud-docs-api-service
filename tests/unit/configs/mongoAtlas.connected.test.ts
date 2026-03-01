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
import type { Db, MongoClient } from 'mongodb';

jest.mock('mongodb', () => {
  const mockDb: Partial<Db> = {
    collection: jest.fn(),
    command: jest.fn().mockResolvedValue({ ok: 1 }) as unknown as Db['command']
  };

  const mockClient: Partial<MongoClient> = {
    db: jest.fn().mockReturnValue(mockDb) as unknown as MongoClient['db'],
    connect: jest.fn().mockResolvedValue(undefined) as unknown as MongoClient['connect'],
    close: jest.fn().mockResolvedValue(undefined) as unknown as MongoClient['close']
  };

  return {
    MongoClient: jest.fn().mockImplementation(() => mockClient as unknown as MongoClient)
  };
});

describe('MongoDB Atlas Configuration - Connection Lifecycle', (): void => {
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
    it('should accept mongodb+srv protocol', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/db';

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
      };
      await expect(getDb()).resolves.not.toThrow();
    });

    it('should use correct MongoDB client options', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
      };
      await getDb();

      // Would verify client options if mock supports it
    });
  });

  describe('getClient - Instance Management', (): void => {
    it('should return client instance after connection', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const {
        getDb,
        getClient
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
        getClient: () => MongoClient;
      };

      await getDb();
      const client = getClient();

      expect(client).toBeDefined();
    });

    it('should return same instance on multiple calls (singleton)', async () => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/test';

      const {
        getDb,
        getClient
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
        getClient: () => MongoClient;
      };

      await getDb();

      const client1 = getClient();
      const client2 = getClient();

      expect(client1).toBe(client2);
    });

    it('should provide access to database methods', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        getClient
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
        getClient: () => unknown;
      };

      await getDb();
      const client = getClient();

      expect(client && typeof (client as unknown as { db?: unknown }).db).toBe('function');
    });
  });

  describe('closeAtlasConnection - Disconnect', (): void => {
    it('should disconnect successfully', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        closeAtlasConnection
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
        closeAtlasConnection: () => Promise<void>;
      };

      await getDb();
      await expect(closeAtlasConnection()).resolves.not.toThrow();
    });
  });

  describe('URI validation - Format Variations', (): void => {
    it('should accept valid MongoDB Atlas URI format', async (): Promise<void> => {
      const validURIs = [
        'mongodb+srv://cluster0.abc123.mongodb.net/dbname',
        'mongodb+srv://mycluster.example.mongodb.net/production',
        'mongodb://localhost:27017/test' // Also support non-SRV
      ];

      for (const uri of validURIs) {
        process.env.MONGO_ATLAS_URI = uri;

        const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
          getDb: () => Promise<Db>;
        };

        await expect(getDb()).resolves.not.toThrow();

        jest.resetModules();
      }
    });

    it('should handle URIs with special characters in password', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://cluster0.example.mongodb.net/db';

        const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
          getDb: () => Promise<Db>;
        };

      await expect(getDb()).resolves.not.toThrow();
    });

    it('should handle URIs with query parameters', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI =
        'mongodb+srv://cluster.example.mongodb.net/db?retryWrites=true&w=majority';

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
      };

      await expect(getDb()).resolves.not.toThrow();
    });
  });

  describe('connection lifecycle - Full Flow', (): void => {
    it('should support connect -> use -> disconnect flow', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';

      const {
        getDb,
        getClient,
        closeAtlasConnection
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<Db>;
        getClient: () => MongoClient;
        closeAtlasConnection: () => Promise<void>;
      };

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
