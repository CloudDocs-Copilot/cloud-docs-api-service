import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';

describe('User Model - Organization Integration', () => {
  let mongoServer: MongoMemoryServer;
  let testOrgId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear una organización de prueba
    const testOrg = await Organization.create({
      name: 'Test Organization',
      owner: new mongoose.Types.ObjectId(),
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

  describe('Organization Field', () => {
    it('should create user with organization reference', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
      });

      expect(user.organization).toBeDefined();
      expect(user.organization?.toString()).toBe(testOrgId.toString());
    });

    it('should allow creating user without organization (optional)', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
      });

      expect(user.organization).toBeUndefined();
    });

    it('should populate organization data', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
      });

      const populatedUser = await User.findById(user._id).populate('organization');
      expect(populatedUser?.organization).toBeDefined();
      // @ts-ignore - organization puede ser un objeto poblado
      expect(populatedUser?.organization.name).toBe('Test Organization');
    });
  });

  describe('Root Folder Field', () => {
    it('should create user with rootFolder reference', async () => {
      const rootFolderId = new mongoose.Types.ObjectId();
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        rootFolder: rootFolderId,
      });

      expect(user.rootFolder).toBeDefined();
      expect(user.rootFolder?.toString()).toBe(rootFolderId.toString());
    });

    it('should allow creating user without rootFolder (optional)', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
      });

      expect(user.rootFolder).toBeUndefined();
    });
  });

  describe('Storage Used Field', () => {
    it('should initialize storageUsed to 0 by default', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
      });

      expect(user.storageUsed).toBe(0);
    });

    it('should allow setting custom storageUsed value', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 1024000, // 1MB
      });

      expect(user.storageUsed).toBe(1024000);
    });

    it('should prevent negative storage values', async () => {
      await expect(
        User.create({
          name: 'Test User',
          email: 'test@example.com',
          password: 'hashedpassword123',
          organization: testOrgId,
          storageUsed: -1000,
        })
      ).rejects.toThrow();
    });

    it('should update storageUsed when files are added', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 0,
      });

      // Simular subida de archivo de 5MB
      const fileSize = 5242880;
      user.storageUsed += fileSize;
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.storageUsed).toBe(5242880);
    });

    it('should decrease storageUsed when files are deleted', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
        storageUsed: 10485760, // 10MB
      });

      // Simular eliminación de archivo de 3MB
      const fileSize = 3145728;
      user.storageUsed -= fileSize;
      await user.save();

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.storageUsed).toBe(7340032); // 10MB - 3MB
    });
  });

  describe('Indexes', () => {
    it('should have index on organization field', async () => {
      const indexes = await User.collection.getIndexes();
      const orgIndex = Object.keys(indexes).find((key) => key.includes('organization'));
      expect(orgIndex).toBeDefined();
    });

    it('should have compound index on organization and email', async () => {
      const indexes = await User.collection.getIndexes();
      const compoundIndex = Object.keys(indexes).find(
        (key) => key.includes('organization') && key.includes('email')
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on organization and active', async () => {
      const indexes = await User.collection.getIndexes();
      const activeIndex = Object.keys(indexes).find(
        (key) => key.includes('organization') && key.includes('active')
      );
      expect(activeIndex).toBeDefined();
    });
  });

  describe('User Query by Organization', () => {
    it('should find users by organization', async () => {
      // Crear usuarios en la misma organización
      await User.create({
        name: 'User 1',
        email: 'user1@example.com',
        password: 'password123',
        organization: testOrgId,
      });

      await User.create({
        name: 'User 2',
        email: 'user2@example.com',
        password: 'password123',
        organization: testOrgId,
      });

      // Crear usuario en otra organización
      const otherOrg = await Organization.create({
        name: 'Other Organization',
        owner: new mongoose.Types.ObjectId(),
      });

      await User.create({
        name: 'User 3',
        email: 'user3@example.com',
        password: 'password123',
        organization: otherOrg._id,
      });

      const usersInTestOrg = await User.find({ organization: testOrgId });
      expect(usersInTestOrg).toHaveLength(2);
    });

    it('should find active users in organization', async () => {
      await User.create({
        name: 'Active User',
        email: 'active@example.com',
        password: 'password123',
        organization: testOrgId,
        active: true,
      });

      await User.create({
        name: 'Inactive User',
        email: 'inactive@example.com',
        password: 'password123',
        organization: testOrgId,
        active: false,
      });

      const activeUsers = await User.find({ organization: testOrgId, active: true });
      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].name).toBe('Active User');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain existing user fields and functionality', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        role: 'admin',
        tokenVersion: 5,
      });

      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
      expect(user.tokenVersion).toBe(5);
      expect(user.active).toBe(true); // default value
    });

    it('should not expose password in JSON', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword123',
        organization: testOrgId,
      });

      const userJSON = user.toJSON();
      expect(userJSON.password).toBeUndefined();
      expect(userJSON.name).toBe('Test User');
    });
  });
});
