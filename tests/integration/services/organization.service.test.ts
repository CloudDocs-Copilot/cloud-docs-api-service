import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as path from 'path';
import * as organizationService from '../../../src/services/organization.service';
import Organization from '../../../src/models/organization.model';
import User from '../../../src/models/user.model';
import Folder from '../../../src/models/folder.model';
import { MembershipRole } from '../../../src/models/membership.model';
import {
  createCompleteOrganization,
  createUserWithoutOrganization,
  assertOrganizationProperties,
  assertMembershipProperties,
  cleanupOrganizationData
} from '../../helpers/organization.helper';
import { anOrganization } from '../../builders/organization.builder';

describe('OrganizationService Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testSetup: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Limpiar directorios de prueba
    const storageDir = path.join(process.cwd(), 'storage');
    if (fs.existsSync(storageDir)) {
      try {
        fs.rmSync(storageDir, { recursive: true, force: true });
      } catch (err: any) {
        if (err && (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM')) {
          console.warn('Warning: could not fully remove storageDir during cleanup:', err.code);
        } else {
          throw err;
        }
      }
    }
  });

  afterEach(async () => {
    await cleanupOrganizationData();
  });

  describe('createOrganization', () => {
    it('should create organization with filesystem directory', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Test Organization',
        ownerName: 'Test Owner',
        ownerEmail: 'owner@test.com'
      });

      const { organization, owner, ownerMembership } = testSetup;

      assertOrganizationProperties(organization, {
        name: 'Test Organization',
        slug: 'test-organization',
        ownerId: owner._id.toString(),
        memberCount: 1
      });

      expect(organization.settings.maxStoragePerUser).toBe(1073741824); // FREE plan: 1GB

      // Verificar membresía automática
      assertMembershipProperties(ownerMembership, {
        userId: owner._id.toString(),
        organizationId: organization._id.toString(),
        role: MembershipRole.OWNER,
        hasRootFolder: true
      });
    });

    it('should create organization with custom settings', async () => {
      const owner = await createUserWithoutOrganization({
        name: 'Custom Owner',
        email: 'custom@test.com'
      });

      const orgData = anOrganization()
        .withName('Custom Settings Org')
        .withOwner(owner._id.toString())
        .withSettings({
          maxStoragePerUser: 1073741824,
          allowedFileTypes: ['application/pdf'],
          maxUsers: 3
        })
        .buildForService();

      const organization = await organizationService.createOrganization(orgData);

      // Settings are overridden by FREE plan limits in pre-save hook
      expect(organization.settings.maxStoragePerUser).toBe(1073741824); // FREE plan: 1GB
      expect(organization.settings.allowedFileTypes).toEqual(['pdf', 'txt', 'doc', 'docx']); // FREE plan allowed types
      expect(organization.settings.maxUsers).toBe(3); // FREE plan max users
    });

    it('should fail if owner user does not exist', async () => {
      const orgData = anOrganization()
        .withName('Invalid Owner Org')
        .withOwner(new mongoose.Types.ObjectId().toString())
        .buildForService();

      await expect(organizationService.createOrganization(orgData)).rejects.toThrow(
        'Owner user not found'
      );
    });

    it('should include owner in members', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Owner Member Org',
        ownerName: 'Test Owner',
        ownerEmail: 'ownertest@test.com'
      });

      const { organization, owner } = testSetup;

      expect(organization.members.map((m: any) => m.toString())).toContain(owner._id.toString());
    });

    it('should fail when creating organization with duplicate name (case-insensitive)', async () => {
      // Create initial org
      await createCompleteOrganization({ orgName: 'Dup Org', ownerEmail: 'dup1@test.com' });

      const owner = await createUserWithoutOrganization({
        name: 'Other Owner',
        email: 'dup2@test.com'
      });
      const orgData = anOrganization()
        .withName('dup org') // different case
        .withOwner(owner._id.toString())
        .buildForService();

      await expect(organizationService.createOrganization(orgData)).rejects.toThrow(
        'Organization name already exists'
      );
    });
  });

  describe('addUserToOrganization', () => {
    it('should add user and create their root folder', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Add User Org',
        ownerName: 'Test Owner',
        ownerEmail: 'owner@test.com'
      });

      const { organization } = testSetup;

      const newUser = await createUserWithoutOrganization({
        name: 'Test Member',
        email: 'member@test.com'
      });

      await organizationService.addUserToOrganization(
        organization._id.toString(),
        newUser._id.toString()
      );

      const updatedOrg = await Organization.findById(organization._id);
      expect(updatedOrg?.members).toHaveLength(2);
      expect(updatedOrg?.members.map(m => m.toString())).toContain(newUser._id.toString());

      // Verificar que se actualizó el usuario
      const updatedUser = await User.findById(newUser._id);
      expect(updatedUser?.organization?.toString()).toBe(organization._id.toString());
      expect(updatedUser?.rootFolder).toBeDefined();

      // Verificar que se creó la carpeta raíz
      const rootFolder = await Folder.findById(updatedUser?.rootFolder);
      expect(rootFolder).toBeDefined();
      expect(rootFolder?.isRoot).toBe(true);
      expect(rootFolder?.owner.toString()).toBe(newUser._id.toString());
    });

    it('should fail if organization does not exist', async () => {
      const fakeOrgId = new mongoose.Types.ObjectId().toString();
      const testUser = await createUserWithoutOrganization();

      await expect(
        organizationService.addUserToOrganization(fakeOrgId, testUser._id.toString())
      ).rejects.toThrow('Organization not found');
    });

    it('should fail when updating organization to a name that already exists', async () => {
      // Create two organizations
      await createCompleteOrganization({ orgName: 'First Org', ownerEmail: 'first@test.com' });
      const second = await createCompleteOrganization({
        orgName: 'Second Org',
        ownerEmail: 'second@test.com'
      });

      const { organization: orgToUpdate, owner } = second;

      await expect(
        organizationService.updateOrganization(
          orgToUpdate._id.toString(),
          owner._id.toString(),
          { name: 'first org' } // different case
        )
      ).rejects.toThrow('Organization name already exists');
    });

    it('should fail if user does not exist', async () => {
      testSetup = await createCompleteOrganization();
      const { organization } = testSetup;

      const fakeUserId = new mongoose.Types.ObjectId().toString();

      await expect(
        organizationService.addUserToOrganization(organization._id.toString(), fakeUserId)
      ).rejects.toThrow('User not found');
    });

    it('should fail if user is already a member', async () => {
      testSetup = await createCompleteOrganization();
      const { organization, owner } = testSetup;

      await expect(
        organizationService.addUserToOrganization(organization._id.toString(), owner._id.toString())
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('should fail if organization has reached max users', async () => {
      // FREE plan allows max 3 users, so owner + 2 additional users = 3 total
      testSetup = await createCompleteOrganization({
        orgName: 'Max Users Org',
        additionalMembers: [
          { name: 'Additional User 1', email: 'additional1@test.com' },
          { name: 'Additional User 2', email: 'additional2@test.com' }
        ]
      });

      const { organization } = testSetup;

      const extraUser = await createUserWithoutOrganization({
        name: 'Extra User',
        email: 'extra@test.com'
      });

      // Try to add third additional user (should fail - would exceed FREE plan limit of 3)
      await expect(
        organizationService.addUserToOrganization(
          organization._id.toString(),
          extraUser._id.toString()
        )
      ).rejects.toThrow('Organization has reached maximum users limit (3) for free plan');
    });
  });

  describe('removeUserFromOrganization', () => {
    it('should remove user from organization', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Remove User Org',
        additionalMembers: [{ name: 'Test Member', email: 'member@test.com' }]
      });

      const { organization, additionalUsers } = testSetup;
      const memberToRemove = additionalUsers[0];

      await organizationService.removeUserFromOrganization(
        organization._id.toString(),
        memberToRemove._id.toString()
      );

      const updatedOrg = await Organization.findById(organization._id);
      expect(updatedOrg?.members).toHaveLength(1);
      expect(updatedOrg?.members.map(m => m.toString())).not.toContain(
        memberToRemove._id.toString()
      );

      const updatedUser = await User.findById(memberToRemove._id);
      expect(updatedUser?.organization).toBeUndefined();
    });

    it('should fail if trying to remove owner', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Remove Owner Org'
      });

      const { organization, owner } = testSetup;

      await expect(
        organizationService.removeUserFromOrganization(
          organization._id.toString(),
          owner._id.toString()
        )
      ).rejects.toThrow('Cannot remove the owner from the organization');
    });

    it('should fail if organization does not exist', async () => {
      const fakeOrgId = new mongoose.Types.ObjectId().toString();
      const testUser = await createUserWithoutOrganization();

      await expect(
        organizationService.removeUserFromOrganization(fakeOrgId, testUser._id.toString())
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('getUserOrganizations', () => {
    it('should return all organizations where user is a member', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Test Org'
      });

      const { owner } = testSetup;

      // testUser es owner y miembro de la organización
      const organizations = await organizationService.getUserOrganizations(owner._id.toString());

      // Debe devolver 1 organización (la que creó como owner)
      expect(organizations).toHaveLength(1);
      // El servicio devuelve membresías con la organización poblada
      expect(organizations[0].organization.slug).toBe('test-org');
    });

    it('should not return inactive organizations', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Inactive Org'
      });

      const { organization, owner } = testSetup;

      organization.active = false;
      await organization.save();

      const organizations = await organizationService.getUserOrganizations(owner._id.toString());

      expect(organizations).toHaveLength(0);
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization with populated fields', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Get By ID Org'
      });

      const { organization: createdOrg } = testSetup;

      const organization = await organizationService.getOrganizationById(createdOrg._id.toString());

      expect(organization._id.toString()).toBe(createdOrg._id.toString());
      expect(organization.name).toBe('Get By ID Org');
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(organizationService.getOrganizationById(fakeId)).rejects.toThrow(
        'Organization not found'
      );
    });
  });

  describe('updateOrganization', () => {
    it('should update organization name and settings', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Original Name'
      });

      const { organization, owner } = testSetup;

      const updated = await organizationService.updateOrganization(
        organization._id.toString(),
        owner._id.toString(),
        {
          name: 'Updated Name',
          settings: {
            maxStoragePerUser: 10737418240
          }
        }
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.settings.maxStoragePerUser).toBe(10737418240);
    });

    it('should fail if user is not the owner', async () => {
      testSetup = await createCompleteOrganization();
      const { organization } = testSetup;

      const nonOwner = await createUserWithoutOrganization({
        name: 'Non Owner',
        email: 'nonowner@test.com'
      });

      await expect(
        organizationService.updateOrganization(
          organization._id.toString(),
          nonOwner._id.toString(),
          { name: 'Hacked Name' }
        )
      ).rejects.toThrow('Only organization owner can update organization');
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const testUser = await createUserWithoutOrganization();

      await expect(
        organizationService.updateOrganization(fakeId, testUser._id.toString(), {
          name: 'New Name'
        })
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('deleteOrganization', () => {
    it('should soft delete organization', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Delete Org'
      });

      const { organization, owner } = testSetup;

      await organizationService.deleteOrganization(
        organization._id.toString(),
        owner._id.toString()
      );

      const deletedOrg = await Organization.findById(organization._id);
      expect(deletedOrg?.active).toBe(false);
    });

    it('should fail if user is not the owner', async () => {
      testSetup = await createCompleteOrganization();
      const { organization } = testSetup;

      const nonOwner = await createUserWithoutOrganization();

      await expect(
        organizationService.deleteOrganization(organization._id.toString(), nonOwner._id.toString())
      ).rejects.toThrow('Only organization owner can delete organization');
    });
  });

  describe('getOrganizationStorageStats', () => {
    it('should calculate storage statistics correctly', async () => {
      testSetup = await createCompleteOrganization({
        orgName: 'Storage Stats Org',
        additionalMembers: [{ name: 'Test Member', email: 'member@test.com' }]
      });

      const { organization, owner, additionalUsers } = testSetup;

      // Actualizar uso de almacenamiento - using reasonable values for FREE plan (1GB per user)
      await User.findByIdAndUpdate(owner._id, { storageUsed: 300000000 }); // 300MB
      await User.findByIdAndUpdate(additionalUsers[0]._id, { storageUsed: 500000000 }); // 500MB

      const stats = await organizationService.getOrganizationStorageStats(
        organization._id.toString()
      );

      // FREE plan: maxStoragePerUser = 1073741824 (1GB), 2 users = 2GB total
      expect(stats.totalStorageLimit).toBe(2147483648); // 2 usuarios * 1GB (FREE plan)
      expect(stats.usedStorage).toBe(800000000); // 300MB + 500MB
      expect(stats.availableStorage).toBe(1347483648); // 2GB - 800MB
      expect(stats.totalUsers).toBe(2);
      expect(stats.storagePerUser).toHaveLength(2);
      expect(stats.storagePerUser[0].percentage).toBeCloseTo(27.9, 1); // 300MB/1GB ≈ 27.9%
      expect(stats.storagePerUser[1].percentage).toBeCloseTo(46.6, 1); // 500MB/1073741824bytes ≈ 46.6%
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(organizationService.getOrganizationStorageStats(fakeId)).rejects.toThrow(
        'Organization not found'
      );
    });
  });
});
