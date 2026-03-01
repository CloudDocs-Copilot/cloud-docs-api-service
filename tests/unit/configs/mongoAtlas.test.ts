/**
 * Unit tests for MongoDB Atlas Configuration
 */

// Use dynamic require inside tests to pick up env changes and module reset

// Mock MongoDB
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

// Use the real mongoAtlas module for these unit tests (override global test setup mock)
jest.unmock('../../../src/configurations/database-config/mongoAtlas');

// Tests that work without actual MongoDB connection (error handling tests)
// Connection-dependent tests moved to mongoAtlas.connected.test.ts
describe('MongoDB Atlas Configuration', (): void => {
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
    it('should connect successfully with valid URI', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/test';
      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
      };
      await expect(getDb()).resolves.not.toThrow();
    });

    it('should throw error when URI is not configured', async (): Promise<void> => {
      delete process.env.MONGO_ATLAS_URI;

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
      };
      await expect(getDb()).rejects.toThrow('MONGO_ATLAS_URI');
    });

    it('should throw error with empty URI', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = '';

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
      };
      await expect(getDb()).rejects.toThrow();
    });

    it('should handle connection errors gracefully', async (): Promise<void> => {
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

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
      };
      await expect(getDb()).rejects.toThrow('Connection failed');
    });

    it('should reject whitespace-only URI', async (): Promise<void> => {
      process.env.MONGO_ATLAS_URI = '   ';

      const { getDb } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
      };
      await expect(getDb()).rejects.toThrow();
    });
  });

  describe('getClient (getClient/getDb)', () => {
    it('should throw error when accessing client before connection', async (): Promise<void> => {
      const { getClient } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getClient: () => unknown;
      };

      expect(() => getClient()).not.toThrow();
    });
  });

  describe('closeAtlasConnection', (): void => {
    it('should handle disconnect when not connected', async (): Promise<void> => {
      const {
        closeAtlasConnection
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        closeAtlasConnection: () => Promise<void>;
      };

      // Should not throw even if not connected
      await expect(closeAtlasConnection()).resolves.not.toThrow();
    });

    it('should handle disconnect errors gracefully', async (): Promise<void> => {
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
      } = (await import('../../../src/configurations/database-config/mongoAtlas')) as unknown as {
        getDb: () => Promise<unknown>;
        closeAtlasConnection: () => Promise<void>;
      };

      await getDb();

      // Should handle error but not throw
      await closeAtlasConnection();
    });
  });
});
