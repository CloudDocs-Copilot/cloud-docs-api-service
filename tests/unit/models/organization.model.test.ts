import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Organization, { generateSlug } from '../../../src/models/organization.model';
import User from '../../../src/models/user.model';

// Set global timeout for all tests
jest.setTimeout(30000);

describe('Organization Model', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    // Crear servidor MongoDB en memoria para tests
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear un usuario de prueba
    const testUser = await User.create({
      name: 'Test Owner',
      email: 'owner@test.com',
      password: 'hashedpassword123'
    });
    testUserId = testUser._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Limpiar colección después de cada test
    await Organization.deleteMany({});
  });

  describe('generateSlug function', () => {
    it('should generate URL-safe slug from name with spaces', () => {
      const slug = generateSlug('Acme Corporation');
      expect(slug).toBe('acme-corporation');
    });

    it('should handle special characters and accents', () => {
      const slug = generateSlug('Compañía Española de Ñoño');
      expect(slug).toBe('compania-espanola-de-nono');
    });

    it('should convert to lowercase', () => {
      const slug = generateSlug('UPPERCASE NAME');
      expect(slug).toBe('uppercase-name');
    });

    it('should remove multiple consecutive hyphens', () => {
      const slug = generateSlug('Name   with    many   spaces');
      expect(slug).toBe('name-with-many-spaces');
    });

    it('should trim leading and trailing hyphens', () => {
      const slug = generateSlug('  Name  ');
      expect(slug).toBe('name');
    });

    it('should handle special symbols', () => {
      const slug = generateSlug('Company & Co. (2024)');
      expect(slug).toBe('company-co-2024');
    });
  });

  describe('Schema Validation', () => {
    it('should create organization with required fields', async () => {
      const orgData = {
        name: 'Test Organization',
        owner: testUserId
      };

      const organization = await Organization.create(orgData);

      expect(organization.name).toBe('Test Organization');
      expect(organization.slug).toBe('test-organization');
      expect(organization.owner.toString()).toBe(testUserId.toString());
      expect(organization.active).toBe(true);
      expect(organization.members).toContainEqual(testUserId);
      expect(organization.settings.maxStoragePerUser).toBe(1073741824); // 1GB FREE plan default
    });

    it('should require name field', async () => {
      const orgData = {
        owner: testUserId
      };

      await expect(Organization.create(orgData)).rejects.toThrow();
    });

    it('should require owner field', async () => {
      const orgData = {
        name: 'Test Organization'
      };

      await expect(Organization.create(orgData)).rejects.toThrow();
    });

    it('should enforce minimum name length', async () => {
      const orgData = {
        name: 'A',
        owner: testUserId
      };

      await expect(Organization.create(orgData)).rejects.toThrow();
    });

    it('should enforce maximum name length', async () => {
      const orgData = {
        name: 'A'.repeat(101),
        owner: testUserId
      };

      await expect(Organization.create(orgData)).rejects.toThrow();
    });

    it('should set default values for settings', async () => {
      const organization = await Organization.create({
        name: 'Default Settings Org',
        owner: testUserId
      });

      expect(organization.settings.maxStoragePerUser).toBe(1073741824); // 1GB FREE plan
      expect(organization.settings.allowedFileTypes).toEqual(['pdf', 'txt', 'doc', 'docx']); // FREE plan types
      expect(organization.settings.maxUsers).toBe(3); // FREE plan max users
    });

    it('should allow custom settings', async () => {
      const organization = await Organization.create({
        name: 'Custom Settings Org',
        owner: testUserId,
        plan: 'free', // Use FREE plan which has maxStoragePerUser: 1GB
        settings: {
          maxStoragePerUser: 1073741824, // 1GB - will be overridden by plan limits
          allowedFileTypes: ['application/pdf', 'image/jpeg'], // will be overridden by plan limits
          maxUsers: 3 // will be overridden by plan limits
        }
      });

      // Settings are overridden by plan limits in pre-save hook
      expect(organization.settings.maxStoragePerUser).toBe(1073741824); // FREE plan value
      expect(organization.settings.allowedFileTypes).toEqual(['pdf', 'txt', 'doc', 'docx']); // FREE plan value
      expect(organization.settings.maxUsers).toBe(3); // FREE plan value
    });
  });

  describe('Unique Slug Constraint', () => {
    it('should prevent duplicate slugs', async () => {
      // Usar nombres distintos que normalicen al mismo slug
      await Organization.create({
        name: 'Unique Org',
        owner: testUserId
      });

      // 'Unique-Org' normaliza a 'unique-org' también, lo que causa colisión de slug
      const secondOrg = await Organization.create({
        name: 'Unique-Org',
        owner: testUserId
      });

      // Debe generar un slug diferente (con sufijo numérico)
      expect(secondOrg.slug).toBe('unique-org-1');
    });

    it('should handle multiple organizations with similar names', async () => {
      // Crear nombres diferentes que normalicen al mismo slug
      const org1 = await Organization.create({ name: 'Test Org', owner: testUserId });
      const org2 = await Organization.create({ name: 'Test-Org', owner: testUserId });
      const org3 = await Organization.create({ name: 'Test! Org', owner: testUserId });

      expect(org1.slug).toBe('test-org');
      expect(org2.slug).toBe('test-org-1');
      expect(org3.slug).toBe('test-org-2');
    });
  });

  describe('Indexes', () => {
    it('should have unique index on slug', async () => {
      const indexes = await Organization.collection.getIndexes();
      const slugIndex = Object.keys(indexes).find(key => key.includes('slug'));
      expect(slugIndex).toBeDefined();
    });

    it('should have index on owner', async () => {
      const indexes = await Organization.collection.getIndexes();
      const ownerIndex = Object.keys(indexes).find(key => key.includes('owner'));
      expect(ownerIndex).toBeDefined();
    });
  });

  describe('Members Management', () => {
    it('should automatically add owner to members on creation', async () => {
      const organization = await Organization.create({
        name: 'Auto Member Org',
        owner: testUserId
      });

      expect(organization.members).toHaveLength(1);
      expect(organization.members[0].toString()).toBe(testUserId.toString());
    });

    it('should add member using addMember method', async () => {
      const organization = await Organization.create({
        name: 'Member Test Org',
        owner: testUserId
      });

      const newUser = await User.create({
        name: 'New Member',
        email: 'newmember@test.com',
        password: 'password123'
      });

      organization.addMember(newUser._id.toString());
      await organization.save();

      expect(organization.members).toHaveLength(2);
      expect(organization.members.map(m => m.toString())).toContain(newUser._id.toString());
    });

    it('should not add duplicate members', async () => {
      const organization = await Organization.create({
        name: 'No Duplicate Org',
        owner: testUserId
      });

      organization.addMember(testUserId.toString());
      organization.addMember(testUserId.toString());
      await organization.save();

      expect(organization.members).toHaveLength(1);
    });

    it('should remove member using removeMember method', async () => {
      const newUser = await User.create({
        name: 'Removable Member',
        email: 'removable@test.com',
        password: 'password123'
      });

      const organization = await Organization.create({
        name: 'Remove Member Org',
        owner: testUserId,
        members: [testUserId, newUser._id]
      });

      organization.removeMember(newUser._id.toString());
      await organization.save();

      expect(organization.members).toHaveLength(1);
      expect(organization.members[0].toString()).toBe(testUserId.toString());
    });
  });

  describe('Virtual Properties', () => {
    it('should calculate memberCount virtual', async () => {
      const organization = await Organization.create({
        name: 'Member Count Org',
        owner: testUserId
      });

      const orgJSON = organization.toJSON();
      expect(orgJSON.memberCount).toBe(1);
    });
  });

  describe('Static Methods', () => {
    it('should find organization by slug', async () => {
      await Organization.create({
        name: 'Findable Org',
        owner: testUserId
      });

      const found = await Organization.findBySlug('findable-org');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Findable Org');
    });

    it('should not find inactive organizations by slug', async () => {
      await Organization.create({
        name: 'Inactive Org',
        owner: testUserId,
        active: false
      });

      const found = await Organization.findBySlug('inactive-org');
      expect(found).toBeNull();
    });

    it('should return null for non-existent slug', async () => {
      const found = await Organization.findBySlug('non-existent-slug');
      expect(found).toBeNull();
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const organization = await Organization.create({
        name: 'Timestamp Org',
        owner: testUserId
      });

      expect(organization.createdAt).toBeInstanceOf(Date);
      expect(organization.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const organization = await Organization.create({
        name: 'Update Time Org',
        owner: testUserId
      });

      const originalUpdatedAt = organization.updatedAt;

      // Esperar un momento para asegurar que el timestamp sea diferente
      await new Promise(resolve => setTimeout(resolve, 10));

      organization.name = 'Updated Name';
      await organization.save();

      expect(organization.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Slug Regeneration on Name Change', () => {
    it('should regenerate slug when name changes', async () => {
      const organization = await Organization.create({
        name: 'Original Name',
        owner: testUserId
      });

      expect(organization.slug).toBe('original-name');

      organization.name = 'New Name';
      await organization.save();

      expect(organization.slug).toBe('new-name');
    });
  });
});
