import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Folder from '../../../src/models/folder.model';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';

describe('Folder Model - Hierarchical Structure', (): void => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testOrgId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuario y organización de prueba
    const testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword123'
    });
    testUserId = testUser._id;

    const testOrg = await Organization.create({
      name: 'Test Organization',
      owner: testUserId
    });
    testOrgId = testOrg._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Folder.deleteMany({});
    await User.deleteMany({ _id: { $ne: testUserId } }); // Limpiar usuarios excepto el de prueba
  });

  describe('Basic Folder Creation', (): void => {
    it('should create folder with required fields', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Test Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/folder'
      });

      expect(folder.name).toBe('Test Folder');
      expect(folder.type).toBe('folder');
      expect(folder.owner.toString()).toBe(testUserId.toString());
      expect(folder.organization?.toString()).toBe(testOrgId.toString());
      expect(folder.parent).toBeNull();
      expect(folder.isRoot).toBe(false);
      expect(folder.path).toBe('/test-org/folder');
    });

    it('should default type to folder', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Default Type Folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/default'
      });

      expect(folder.type).toBe('folder');
    });

    it('should allow organization field to be optional', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'No Org Folder',
        type: 'folder',
        owner: testUserId,
        parent: null,
        isRoot: false,
        path: '/folder'
      });

      expect(folder.organization).toBeNull();
      expect(folder.name).toBe('No Org Folder');
    });
  });

  describe('Root Folder with Technical Name', (): void => {
    it('should create root folder with technical identifier', async (): Promise<void> => {
      const rootFolder = await Folder.create({
        name: `root_test-organization_${testUserId}`,
        type: 'root',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: true,
        path: `/test-organization/${testUserId}`
      });

      expect(rootFolder.name).toBe(`root_test-organization_${testUserId}`);
      expect(rootFolder.type).toBe('root');
      expect(rootFolder.isRoot).toBe(true);
      expect(rootFolder.parent).toBeNull();
    });

    it('should use displayName for user-friendly name', async (): Promise<void> => {
      const rootFolder = await Folder.create({
        name: `root_test-organization_${testUserId}`,
        displayName: 'Mi Unidad',
        type: 'root',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: true,
        path: `/test-organization/${testUserId}`
      });

      expect(rootFolder.displayName).toBe('Mi Unidad');
      // @ts-ignore - visibleName es un virtual
      expect(rootFolder.visibleName).toBe('Mi Unidad');
    });

    it('should fallback to name if no displayName', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'technical_name',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/technical'
      });

      // @ts-ignore - visibleName es un virtual
      expect(folder.visibleName).toBe('technical_name');
    });
  });

  describe('Folder Type Validation', (): void => {
    it('should accept valid folder types', async (): Promise<void> => {
      const types: ('root' | 'folder' | 'shared')[] = ['root', 'folder', 'shared'];

      for (const type of types) {
        const folder = await Folder.create({
          name: `${type} Folder`,
          type,
          owner: testUserId,
          organization: testOrgId,
          parent: null,
          isRoot: type === 'root',
          path: `/test-org/${type}`
        });

        expect(folder.type).toBe(type);
      }
    });

    it('should reject invalid folder type', async (): Promise<void> => {
      await expect(
        Folder.create({
          name: 'Invalid Type Folder',
          type: 'invalid',
          owner: testUserId,
          organization: testOrgId,
          parent: null,
          isRoot: false,
          path: '/test-org/invalid'
        })
      ).rejects.toThrow();
    });
  });

  describe('Parent-Child Relationship', (): void => {
    it('should create subfolder with parent reference', async (): Promise<void> => {
      const parentFolder = await Folder.create({
        name: 'Parent Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/parent'
      });

      const childFolder = await Folder.create({
        name: 'Child Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: parentFolder._id,
        isRoot: false,
        path: '/test-org/parent/child'
      });

      expect(childFolder.parent?.toString()).toBe(parentFolder._id.toString());
    });

    it('should build correct nested path', async (): Promise<void> => {
      const root = await Folder.create({
        name: `root_test-organization_${testUserId}`,
        type: 'root',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: true,
        path: `/test-org/${testUserId}`
      });

      const level1 = await Folder.create({
        name: 'Projects',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: root._id,
        isRoot: false,
        path: `/test-org/${testUserId}/projects`
      });

      const level2 = await Folder.create({
        name: 'Project A',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: level1._id,
        isRoot: false,
        path: `/test-org/${testUserId}/projects/project-a`
      });

      expect(level2.path).toBe(`/test-org/${testUserId}/projects/project-a`);
    });

    it('should find children of a parent folder', async (): Promise<void> => {
      const parent = await Folder.create({
        name: 'Parent',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/parent'
      });

      await Folder.create({
        name: 'Child 1',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: parent._id,
        isRoot: false,
        path: '/test-org/parent/child1'
      });

      await Folder.create({
        name: 'Child 2',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: parent._id,
        isRoot: false,
        path: '/test-org/parent/child2'
      });

      const children = await Folder.find({ parent: parent._id });
      expect(children).toHaveLength(2);
    });
  });

  describe('Permissions System', (): void => {
    it('should share folder with viewer permission', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Shared Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/shared'
      });

      const otherUser = await User.create({
        name: 'Other User',
        email: 'other@example.com',
        password: 'password123'
      });

      folder.shareWith(otherUser._id.toString(), 'viewer');
      await folder.save();

      expect(folder.permissions).toHaveLength(1);
      expect(folder.permissions[0].userId.toString()).toBe(otherUser._id.toString());
      expect(folder.permissions[0].role).toBe('viewer');
      expect(folder.sharedWith).toContainEqual(otherUser._id);
    });

    it('should share folder with editor permission', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Editor Shared Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/editor'
      });

      const editorUser = await User.create({
        name: 'Editor User',
        email: 'editor@example.com',
        password: 'password123'
      });

      folder.shareWith(editorUser._id.toString(), 'editor');
      await folder.save();

      expect(folder.permissions[0].role).toBe('editor');
    });

    it('should update permission role when sharing again', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Update Permission Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/update'
      });

      const user = await User.create({
        name: 'User',
        email: 'user@example.com',
        password: 'password123'
      });

      folder.shareWith(user._id.toString(), 'viewer');
      await folder.save();
      expect(folder.permissions[0].role).toBe('viewer');

      folder.shareWith(user._id.toString(), 'editor');
      await folder.save();
      expect(folder.permissions).toHaveLength(1);
      expect(folder.permissions[0].role).toBe('editor');
    });

    it('should not share folder with owner', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Owner Share Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/owner'
      });

      folder.shareWith(testUserId.toString(), 'viewer');
      await folder.save();

      expect(folder.permissions).toHaveLength(0);
    });

    it('should remove user access with unshareWith', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Unshare Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/unshare'
      });

      const user = await User.create({
        name: 'User',
        email: 'user@example.com',
        password: 'password123'
      });

      folder.shareWith(user._id.toString(), 'editor');
      await folder.save();
      expect(folder.permissions).toHaveLength(1);

      folder.unshareWith(user._id.toString());
      await folder.save();
      expect(folder.permissions).toHaveLength(0);
      expect(folder.sharedWith).toHaveLength(0);
    });
  });

  describe('Access Control', (): void => {
    it('should grant owner full access', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Owner Access Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/owner-access'
      });

      expect(folder.hasAccess(testUserId.toString())).toBe(true);
      expect(folder.hasAccess(testUserId.toString(), 'owner')).toBe(true);
      expect(folder.hasAccess(testUserId.toString(), 'editor')).toBe(true);
      expect(folder.hasAccess(testUserId.toString(), 'viewer')).toBe(true);
    });

    it('should verify viewer access', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Viewer Access Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/viewer-access'
      });

      const viewer = await User.create({
        name: 'Viewer',
        email: 'viewer@example.com',
        password: 'password123'
      });

      folder.shareWith(viewer._id.toString(), 'viewer');

      expect(folder.hasAccess(viewer._id.toString())).toBe(true);
      expect(folder.hasAccess(viewer._id.toString(), 'viewer')).toBe(true);
      expect(folder.hasAccess(viewer._id.toString(), 'editor')).toBe(false);
      expect(folder.hasAccess(viewer._id.toString(), 'owner')).toBe(false);
    });

    it('should verify editor access', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'Editor Access Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/editor-access'
      });

      const editor = await User.create({
        name: 'Editor',
        email: 'editor@example.com',
        password: 'password123'
      });

      folder.shareWith(editor._id.toString(), 'editor');

      expect(folder.hasAccess(editor._id.toString())).toBe(true);
      expect(folder.hasAccess(editor._id.toString(), 'viewer')).toBe(true);
      expect(folder.hasAccess(editor._id.toString(), 'editor')).toBe(true);
      expect(folder.hasAccess(editor._id.toString(), 'owner')).toBe(false);
    });

    it('should deny access to users without permissions', async (): Promise<void> => {
      const folder = await Folder.create({
        name: 'No Access Folder',
        type: 'folder',
        owner: testUserId,
        organization: testOrgId,
        parent: null,
        isRoot: false,
        path: '/test-org/no-access'
      });

      const otherUser = await User.create({
        name: 'Other',
        email: 'other@example.com',
        password: 'password123'
      });

      expect(folder.hasAccess(otherUser._id.toString())).toBe(false);
    });
  });

  describe('Indexes', (): void => {
    it('should have index on organization and owner', async (): Promise<void> => {
      const indexes = await Folder.collection.getIndexes();
      const orgOwnerIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('owner')
      );
      expect(orgOwnerIndex).toBeDefined();
    });

    it('should have index on organization and parent', async (): Promise<void> => {
      const indexes = await Folder.collection.getIndexes();
      const orgParentIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('parent')
      );
      expect(orgParentIndex).toBeDefined();
    });

    it('should have index on owner and isRoot', async (): Promise<void> => {
      const indexes = await Folder.collection.getIndexes();
      const rootIndex = Object.keys(indexes).find(
        key => key.includes('owner') && key.includes('isRoot')
      );
      expect(rootIndex).toBeDefined();
    });
  });
});
