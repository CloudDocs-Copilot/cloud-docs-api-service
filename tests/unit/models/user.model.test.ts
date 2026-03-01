import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';

describe('User Model - Organization Integration', (): void => {
  let mongoServer: MongoMemoryServer;
  let testOrgId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear una organización de prueba
    const testOrg = await Organization.create({
      name: 'Test Organization',
      owner: new mongoose.Types.ObjectId()
    });
    testOrgId = testOrg._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('Organization Field', (): void => {
    it('should create user with organization reference', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      expect(user.organization).toBeDefined();
      expect(user.organization?.toString()).toBe(testOrgId.toString());
    });

    it('should allow creating user without organization (optional)', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123'
      });

      expect(user.organization).toBeUndefined();
    });

    it('should populate organization data', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      const populatedUser = await User.findById(user._id).populate('organization');
      expect(populatedUser?.organization).toBeDefined();
      // @ts-ignore - organization puede ser un objeto poblado
      expect(populatedUser?.organization.name).toBe('Test Organization');
    });
  });

  describe('Root Folder Field', (): void => {
    it('should create user with rootFolder reference', async (): Promise<void> => {
      const rootFolderId = new mongoose.Types.ObjectId();
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        rootFolder: rootFolderId
      });

      expect(user.rootFolder).toBeDefined();
      expect(user.rootFolder?.toString()).toBe(rootFolderId.toString());
    });

    it('should allow creating user without rootFolder (optional)', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      expect(user.rootFolder).toBeUndefined();
    });
  });

  describe('Storage Used Field', (): void => {
    it('should initialize storageUsed to 0 by default', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      expect(user.storageUsed).toBe(0);
    });

    it('should allow setting custom storageUsed value', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 1024000 // 1MB
      });

      expect(user.storageUsed).toBe(1024000);
    });

    it('should prevent negative storage values', async (): Promise<void> => {
      await expect(
        User.create({
          name: 'Test User',
          email: 'test@example.com',
          password: 'hashedpassword123',
          organization: testOrgId,
          storageUsed: -1000
        })
      ).rejects.toThrow();
    });

    it('should update storageUsed when files are added', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 0
      });

      // Simular subida de archivo de 5MB
      const fileSize = 5242880;
      user.storageUsed += fileSize;
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.storageUsed).toBe(5242880);
    });

    it('should decrease storageUsed when files are deleted', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 10485760 // 10MB
      });

      // Simular eliminación de archivo de 3MB
      const fileSize = 3145728;
      user.storageUsed -= fileSize;
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.storageUsed).toBe(7340032); // 10MB - 3MB
    });
  });

  describe('Indexes', (): void => {
    it('should have index on organization field', async (): Promise<void> => {
      const indexes = await User.collection.getIndexes();
      const orgIndex = Object.keys(indexes).find(key => key.includes('organization'));
      expect(orgIndex).toBeDefined();
    });

    it('should have compound index on organization and email', async (): Promise<void> => {
      const indexes = await User.collection.getIndexes();
      const compoundIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('email')
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on organization and active', async (): Promise<void> => {
      const indexes = await User.collection.getIndexes();
      const activeIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('active')
      );
      expect(activeIndex).toBeDefined();
    });
  });

  describe('User Query by Organization', (): void => {
    it('should find users by organization', async (): Promise<void> => {
      // Crear usuarios en la misma organización
      await User.create({
        name: 'User 1',
        email: 'user1@example.com',
        password: 'password123',
        organization: testOrgId
      });

      await User.create({
        name: 'User 2',
        email: 'user2@example.com',
        password: 'password123',
        organization: testOrgId
      });

      // Crear usuario en otra organización
      const otherOrg = await Organization.create({
        name: 'Other Organization',
        owner: new mongoose.Types.ObjectId()
      });

      await User.create({
        name: 'User 3',
        email: 'user3@example.com',
        password: 'password123',
        organization: otherOrg._id
      });

      const usersInTestOrg = await User.find({ organization: testOrgId });
      expect(usersInTestOrg).toHaveLength(2);
    });

    it('should find active users in organization', async (): Promise<void> => {
      await User.create({
        name: 'Active User',
        email: 'active@example.com',
        password: 'password123',
        organization: testOrgId,
        active: true
      });

      await User.create({
        name: 'Inactive User',
        email: 'inactive@example.com',
        password: 'password123',
        organization: testOrgId,
        active: false
      });

      const activeUsers = await User.find({ organization: testOrgId, active: true });
      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].name).toBe('Active User');
    });
  });

  describe('Backward Compatibility', (): void => {
    it('should maintain existing user fields and functionality', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        role: 'admin',
        tokenVersion: 5
      });

      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
      expect(user.tokenVersion).toBe(5);
      expect(user.active).toBe(false); // default value
    });

    it('should not expose password in JSON', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      const userJSON = user.toJSON();
      expect(userJSON.password).toBeUndefined();
      expect(userJSON.name).toBe('Test User');
    });
  });

  describe('Avatar Field', (): void => {
    it('should allow creating user without avatar (default null)', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId
      });

      expect(user.avatar).toBeNull();
    });

    it('should allow setting avatar URL', async (): Promise<void> => {
      const avatarUrl = 'https://example.com/avatar.jpg';
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: avatarUrl
      });

      expect(user.avatar).toBe(avatarUrl);
    });

    it('should trim whitespace from avatar URL', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: '  https://example.com/avatar.jpg  '
      });

      expect(user.avatar).toBe('https://example.com/avatar.jpg');
    });

    it('should allow empty string for avatar', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: ''
      });

      expect(user.avatar).toBe('');
    });

    it('should reject avatar URL exceeding 2048 characters', async (): Promise<void> => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);

      await expect(
        User.create({
          name: 'Test User',
          email: 'test@example.com',
          password: 'hashedpassword123',
          organization: testOrgId,
          avatar: longUrl
        })
      ).rejects.toThrow(/cannot exceed 2048 characters/i);
    });

    it('should allow data URLs as avatar', async (): Promise<void> => {
      const dataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: dataUrl
      });

      expect(user.avatar).toBe(dataUrl);
    });

    it('should allow relative paths as avatar', async (): Promise<void> => {
      const relativePath = '/uploads/avatars/user123.jpg';
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: relativePath
      });

      expect(user.avatar).toBe(relativePath);
    });

    it('should update avatar successfully', async (): Promise<void> => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: 'https://example.com/old.jpg'
      });

      user.avatar = 'https://example.com/new.jpg';
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.avatar).toBe('https://example.com/new.jpg');
    });

    it('should include avatar in JSON response', async (): Promise<void> => {
      const avatarUrl = 'https://example.com/avatar.jpg';
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        avatar: avatarUrl
      });

      const userJSON = user.toJSON();
      expect(userJSON.avatar).toBe(avatarUrl);
      expect(userJSON.password).toBeUndefined();
    });
  });
});
