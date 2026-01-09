import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as path from 'path';
import * as organizationService from '../../../src/services/organization.service';
import Organization from '../../../src/models/organization.model';
import User from '../../../src/models/user.model';
import Folder from '../../../src/models/folder.model';

describe('OrganizationService Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuarios de prueba
    const user1 = await User.create({
      name: 'Test Owner',
      email: 'owner@test.com',
      password: 'hashedpassword123',
    });
    testUserId = user1._id;

    const user2 = await User.create({
      name: 'Test Member',
      email: 'member@test.com',
      password: 'hashedpassword123',
    });
    testUser2Id = user2._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Limpiar directorios de prueba
    const storageDir = path.join(process.cwd(), 'storage');
    if (fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await Folder.deleteMany({});
    await User.updateMany({}, { $unset: { organization: 1, rootFolder: 1 } });
  });

  describe('createOrganization', () => {
    it('should create organization with filesystem directory', async () => {
      const orgData = {
        name: 'Test Organization',
        ownerId: testUserId.toString(),
      };

      const organization = await organizationService.createOrganization(orgData);

      expect(organization.name).toBe('Test Organization');
      expect(organization.slug).toBe('test-organization');
      expect(organization.owner.toString()).toBe(testUserId.toString());
      expect(organization.members).toHaveLength(1);
      expect(organization.settings.maxStoragePerUser).toBe(5368709120);

      // Verificar que se creó el directorio
      const orgDir = path.join(process.cwd(), 'storage', organization.slug);
      expect(fs.existsSync(orgDir)).toBe(true);
    });

    it('should create organization with custom settings', async () => {
      const orgData = {
        name: 'Custom Settings Org',
        ownerId: testUserId.toString(),
        settings: {
          maxStoragePerUser: 10737418240, // 10GB
          allowedFileTypes: ['application/pdf', 'image/jpeg'],
          maxUsers: 50,
        },
      };

      const organization = await organizationService.createOrganization(orgData);

      expect(organization.settings.maxStoragePerUser).toBe(10737418240);
      expect(organization.settings.allowedFileTypes).toEqual([
        'application/pdf',
        'image/jpeg',
      ]);
      expect(organization.settings.maxUsers).toBe(50);
    });

    it('should fail if owner user does not exist', async () => {
      const orgData = {
        name: 'Invalid Owner Org',
        ownerId: new mongoose.Types.ObjectId().toString(),
      };

      await expect(
        organizationService.createOrganization(orgData)
      ).rejects.toThrow('Owner user not found');
    });

    it('should include owner in members', async () => {
      const orgData = {
        name: 'Owner Member Org',
        ownerId: testUserId.toString(),
      };

      const organization = await organizationService.createOrganization(orgData);

      expect(organization.members.map((m) => m.toString())).toContain(
        testUserId.toString()
      );
    });
  });

  describe('addUserToOrganization', () => {
    it('should add user and create their root folder', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Add User Org',
        ownerId: testUserId.toString(),
      });

      await organizationService.addUserToOrganization(
        organization._id.toString(),
        testUser2Id.toString()
      );

      const updatedOrg = await Organization.findById(organization._id);
      expect(updatedOrg?.members).toHaveLength(2);
      expect(
        updatedOrg?.members.map((m) => m.toString())
      ).toContain(testUser2Id.toString());

      // Verificar que se actualizó el usuario
      const updatedUser = await User.findById(testUser2Id);
      expect(updatedUser?.organization?.toString()).toBe(
        organization._id.toString()
      );
      expect(updatedUser?.rootFolder).toBeDefined();

      // Verificar que se creó la carpeta raíz
      const rootFolder = await Folder.findById(updatedUser?.rootFolder);
      expect(rootFolder).toBeDefined();
      expect(rootFolder?.isRoot).toBe(true);
      expect(rootFolder?.owner.toString()).toBe(testUser2Id.toString());

      // Verificar directorio físico
      const userDir = path.join(
        process.cwd(),
        'storage',
        organization.slug,
        testUser2Id.toString()
      );
      expect(fs.existsSync(userDir)).toBe(true);
    });

    it('should fail if organization does not exist', async () => {
      const fakeOrgId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.addUserToOrganization(fakeOrgId, testUser2Id.toString())
      ).rejects.toThrow('Organization not found');
    });

    it('should fail if user does not exist', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: testUserId.toString(),
      });

      const fakeUserId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.addUserToOrganization(
          organization._id.toString(),
          fakeUserId
        )
      ).rejects.toThrow('User not found');
    });

    it('should fail if user is already a member', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: testUserId.toString(),
      });

      await expect(
        organizationService.addUserToOrganization(
          organization._id.toString(),
          testUserId.toString()
        )
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('should fail if organization has reached max users', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Max Users Org',
        ownerId: testUserId.toString(),
        settings: { maxUsers: 1 },
      });

      await expect(
        organizationService.addUserToOrganization(
          organization._id.toString(),
          testUser2Id.toString()
        )
      ).rejects.toThrow('Organization has reached maximum number of users');
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should remove user from organization', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Remove User Org',
        ownerId: testUserId.toString(),
      });

      await organizationService.addUserToOrganization(
        organization._id.toString(),
        testUser2Id.toString()
      );

      await organizationService.removeUserFromOrganization(
        organization._id.toString(),
        testUser2Id.toString()
      );

      const updatedOrg = await Organization.findById(organization._id);
      expect(updatedOrg?.members).toHaveLength(1);
      expect(
        updatedOrg?.members.map((m) => m.toString())
      ).not.toContain(testUser2Id.toString());

      const updatedUser = await User.findById(testUser2Id);
      expect(updatedUser?.organization).toBeUndefined();
    });

    it('should fail if trying to remove owner', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Remove Owner Org',
        ownerId: testUserId.toString(),
      });

      await expect(
        organizationService.removeUserFromOrganization(
          organization._id.toString(),
          testUserId.toString()
        )
      ).rejects.toThrow('Cannot remove the owner from the organization');
    });

    it('should fail if organization does not exist', async () => {
      const fakeOrgId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.removeUserFromOrganization(
          fakeOrgId,
          testUser2Id.toString()
        )
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('getUserOrganizations', () => {
    it('should return all organizations where user is a member', async () => {
      await organizationService.createOrganization({
        name: 'Org 1',
        ownerId: testUserId.toString(),
      });

      await organizationService.createOrganization({
        name: 'Org 2',
        ownerId: testUserId.toString(),
      });

      const organizations = await organizationService.getUserOrganizations(
        testUserId.toString()
      );

      expect(organizations).toHaveLength(2);
      expect(organizations.map((o) => o.slug)).toContain('org-1');
      expect(organizations.map((o) => o.slug)).toContain('org-2');
    });

    it('should not return inactive organizations', async () => {
      const org = await organizationService.createOrganization({
        name: 'Inactive Org',
        ownerId: testUserId.toString(),
      });

      org.active = false;
      await org.save();

      const organizations = await organizationService.getUserOrganizations(
        testUserId.toString()
      );

      expect(organizations).toHaveLength(0);
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization with populated fields', async () => {
      const createdOrg = await organizationService.createOrganization({
        name: 'Get By ID Org',
        ownerId: testUserId.toString(),
      });

      const organization = await organizationService.getOrganizationById(
        createdOrg._id.toString()
      );

      expect(organization._id.toString()).toBe(createdOrg._id.toString());
      expect(organization.name).toBe('Get By ID Org');
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.getOrganizationById(fakeId)
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('updateOrganization', () => {
    it('should update organization name and settings', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Original Name',
        ownerId: testUserId.toString(),
      });

      const updated = await organizationService.updateOrganization(
        organization._id.toString(),
        testUserId.toString(),
        {
          name: 'Updated Name',
          settings: {
            maxStoragePerUser: 10737418240,
          },
        }
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.settings.maxStoragePerUser).toBe(10737418240);
    });

    it('should fail if user is not the owner', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: testUserId.toString(),
      });

      await expect(
        organizationService.updateOrganization(
          organization._id.toString(),
          testUser2Id.toString(),
          { name: 'Hacked Name' }
        )
      ).rejects.toThrow('Only organization owner can update organization');
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.updateOrganization(
          fakeId,
          testUserId.toString(),
          { name: 'New Name' }
        )
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('deleteOrganization', () => {
    it('should soft delete organization', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Delete Org',
        ownerId: testUserId.toString(),
      });

      await organizationService.deleteOrganization(
        organization._id.toString(),
        testUserId.toString()
      );

      const deletedOrg = await Organization.findById(organization._id);
      expect(deletedOrg?.active).toBe(false);
    });

    it('should fail if user is not the owner', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Test Org',
        ownerId: testUserId.toString(),
      });

      await expect(
        organizationService.deleteOrganization(
          organization._id.toString(),
          testUser2Id.toString()
        )
      ).rejects.toThrow('Only organization owner can delete organization');
    });
  });

  describe('getOrganizationStorageStats', () => {
    it('should calculate storage statistics correctly', async () => {
      const organization = await organizationService.createOrganization({
        name: 'Storage Stats Org',
        ownerId: testUserId.toString(),
        settings: {
          maxStoragePerUser: 1000000, // 1MB para facilitar cálculos
        },
      });

      await organizationService.addUserToOrganization(
        organization._id.toString(),
        testUser2Id.toString()
      );

      // Actualizar uso de almacenamiento
      await User.findByIdAndUpdate(testUserId, { storageUsed: 300000 });
      await User.findByIdAndUpdate(testUser2Id, { storageUsed: 500000 });

      const stats = await organizationService.getOrganizationStorageStats(
        organization._id.toString()
      );

      expect(stats.totalStorageLimit).toBe(2000000); // 2 usuarios * 1MB
      expect(stats.usedStorage).toBe(800000); // 300KB + 500KB
      expect(stats.availableStorage).toBe(1200000);
      expect(stats.totalUsers).toBe(2);
      expect(stats.storagePerUser).toHaveLength(2);
      expect(stats.storagePerUser[0].percentage).toBeCloseTo(30);
      expect(stats.storagePerUser[1].percentage).toBeCloseTo(50);
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.getOrganizationStorageStats(fakeId)
      ).rejects.toThrow('Organization not found');
    });
  });
});
