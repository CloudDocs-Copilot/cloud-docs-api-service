import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import DocumentModel from '../../../src/models/document.model';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';
import Folder from '../../../src/models/folder.model';

describe('Document Model - Organization Structure', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testOrgId: mongoose.Types.ObjectId;
  let testFolderId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuario de prueba
    const testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword123'
    });
    testUserId = testUser._id;

    // Crear organización de prueba
    const testOrg = await Organization.create({
      name: 'Test Organization',
      owner: testUserId
    });
    testOrgId = testOrg._id;

    // Crear carpeta de prueba
    const testFolder = await Folder.create({
      name: 'Test Folder',
      type: 'folder',
      owner: testUserId,
      organization: testOrgId,
      parent: null,
      isRoot: false,
      path: '/test-org/test-folder'
    });
    testFolderId = testFolder._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await DocumentModel.deleteMany({});
    await Folder.deleteMany({ _id: { $ne: testFolderId } }); // Limpiar carpetas excepto la de prueba
    await Organization.deleteMany({ _id: { $ne: testOrgId } }); // Limpiar organizaciones excepto la de prueba
    await User.deleteMany({ _id: { $ne: testUserId } }); // Limpiar usuarios excepto el de prueba
  });

  describe('Required Fields', () => {
    it('should create document with all required fields', async () => {
      const document = await DocumentModel.create({
        filename: 'test-file.pdf',
        originalname: 'Test File.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/test-org/test-folder/test-file.pdf',
        size: 1024000,
        mimeType: 'application/pdf'
      });

      expect(document.filename).toBe('test-file.pdf');
      expect(document.originalname).toBe('Test File.pdf');
      expect(document.uploadedBy.toString()).toBe(testUserId.toString());
      expect(document.organization?.toString()).toBe(testOrgId.toString());
      expect(document.folder.toString()).toBe(testFolderId.toString());
      expect(document.path).toBe('/test-org/test-folder/test-file.pdf');
      expect(document.size).toBe(1024000);
      expect(document.mimeType).toBe('application/pdf');
    });

    it('should allow organization field to be optional', async () => {
      const document = await DocumentModel.create({
        filename: 'test.pdf',
        uploadedBy: testUserId,
        folder: testFolderId,
        path: '/path/test.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      expect(document.organization).toBeNull();
      expect(document.filename).toBe('test.pdf');
    });

    it('should require folder field', async () => {
      await expect(
        DocumentModel.create({
          filename: 'test.pdf',
          uploadedBy: testUserId,
          organization: testOrgId,
          path: '/path/test.pdf',
          size: 1000,
          mimeType: 'application/pdf'
        })
      ).rejects.toThrow();
    });

    it('should require path field', async () => {
      await expect(
        DocumentModel.create({
          filename: 'test.pdf',
          uploadedBy: testUserId,
          organization: testOrgId,
          folder: testFolderId,
          size: 1000,
          mimeType: 'application/pdf'
        })
      ).rejects.toThrow();
    });

    it('should require size field', async () => {
      await expect(
        DocumentModel.create({
          filename: 'test.pdf',
          uploadedBy: testUserId,
          organization: testOrgId,
          folder: testFolderId,
          path: '/path/test.pdf',
          mimeType: 'application/pdf'
        })
      ).rejects.toThrow();
    });

    it('should require mimeType field', async () => {
      await expect(
        DocumentModel.create({
          filename: 'test.pdf',
          uploadedBy: testUserId,
          organization: testOrgId,
          folder: testFolderId,
          path: '/path/test.pdf',
          size: 1000
        })
      ).rejects.toThrow();
    });
  });

  describe('File Size Validation', () => {
    it('should accept valid file size', async () => {
      const document = await DocumentModel.create({
        filename: 'test.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/test.pdf',
        size: 5242880, // 5MB
        mimeType: 'application/pdf'
      });

      expect(document.size).toBe(5242880);
    });

    it('should prevent negative file size', async () => {
      await expect(
        DocumentModel.create({
          filename: 'test.pdf',
          uploadedBy: testUserId,
          organization: testOrgId,
          folder: testFolderId,
          path: '/path/test.pdf',
          size: -1000,
          mimeType: 'application/pdf'
        })
      ).rejects.toThrow();
    });

    it('should accept zero size (empty file)', async () => {
      const document = await DocumentModel.create({
        filename: 'empty.txt',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/empty.txt',
        size: 0,
        mimeType: 'text/plain'
      });

      expect(document.size).toBe(0);
    });
  });

  describe('Path and Filesystem', () => {
    it('should store complete filesystem path', async () => {
      const document = await DocumentModel.create({
        filename: 'document.docx',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/test-org/user-id/folder/document.docx',
        size: 2048000,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      expect(document.path).toBe('/test-org/user-id/folder/document.docx');
    });

    it('should handle nested folder paths', async () => {
      const document = await DocumentModel.create({
        filename: 'nested.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/org/user/projects/2024/q1/nested.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      expect(document.path).toContain('/projects/2024/q1/');
    });
  });

  describe('MIME Types', () => {
    it('should store various MIME types', async () => {
      const mimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'text/plain',
        'application/vnd.ms-excel',
        'video/mp4'
      ];

      for (const mimeType of mimeTypes) {
        const doc = await DocumentModel.create({
          filename: `file.${mimeType.split('/')[1]}`,
          uploadedBy: testUserId,
          organization: testOrgId,
          folder: testFolderId,
          path: `/path/file.${mimeType.split('/')[1]}`,
          size: 1000,
          mimeType
        });

        expect(doc.mimeType).toBe(mimeType);
      }
    });
  });

  describe('Organization Association', () => {
    it('should associate document with organization', async () => {
      const document = await DocumentModel.create({
        filename: 'org-doc.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/org-doc.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      const populated = await DocumentModel.findById(document._id).populate('organization');
      expect(populated?.organization).toBeDefined();
      // @ts-ignore
      expect(populated?.organization.name).toBe('Test Organization');
    });

    it('should find documents by organization', async () => {
      // Crear documentos en la organización de prueba
      await DocumentModel.create({
        filename: 'doc1.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/doc1.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      await DocumentModel.create({
        filename: 'doc2.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/doc2.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      // Crear documento en otra organización
      const otherOrg = await Organization.create({
        name: 'Other Org',
        owner: testUserId
      });

      const otherFolder = await Folder.create({
        name: 'Other Folder',
        type: 'folder',
        owner: testUserId,
        organization: otherOrg._id,
        parent: null,
        isRoot: false,
        path: '/other-org/folder'
      });

      await DocumentModel.create({
        filename: 'doc3.pdf',
        uploadedBy: testUserId,
        organization: otherOrg._id,
        folder: otherFolder._id,
        path: '/path/doc3.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      const docsInTestOrg = await DocumentModel.find({ organization: testOrgId });
      expect(docsInTestOrg).toHaveLength(2);
    });
  });

  describe('Folder Association', () => {
    it('should associate document with folder', async () => {
      const document = await DocumentModel.create({
        filename: 'folder-doc.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/folder-doc.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      const populated = await DocumentModel.findById(document._id).populate('folder');
      expect(populated?.folder).toBeDefined();
      // @ts-ignore
      expect(populated?.folder.name).toBe('Test Folder');
    });

    it('should find documents in a specific folder', async () => {
      await DocumentModel.create({
        filename: 'doc1.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/doc1.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      await DocumentModel.create({
        filename: 'doc2.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/doc2.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      const docsInFolder = await DocumentModel.find({ folder: testFolderId });
      expect(docsInFolder).toHaveLength(2);
    });
  });

  describe('Sharing Functionality', () => {
    it('should share document with users', async () => {
      const document = await DocumentModel.create({
        filename: 'shared-doc.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/shared-doc.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      const user2 = await User.create({
        name: 'User 2',
        email: 'user2@example.com',
        password: 'password123'
      });

      document.sharedWith.push(user2._id);
      await document.save();

      expect(document.sharedWith).toHaveLength(1);
      expect(document.sharedWith[0].toString()).toBe(user2._id.toString());
    });

    it('should find documents shared with a user', async () => {
      const user2 = await User.create({
        name: 'User 2',
        email: 'user2@example.com',
        password: 'password123'
      });

      await DocumentModel.create({
        filename: 'shared1.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/shared1.pdf',
        size: 1000,
        mimeType: 'application/pdf',
        sharedWith: [user2._id]
      });

      await DocumentModel.create({
        filename: 'shared2.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/shared2.pdf',
        size: 1000,
        mimeType: 'application/pdf',
        sharedWith: [user2._id]
      });

      const sharedDocs = await DocumentModel.find({ sharedWith: user2._id });
      expect(sharedDocs).toHaveLength(2);
    });
  });

  describe('Indexes', () => {
    it('should have index on organization and folder', async () => {
      const indexes = await DocumentModel.collection.getIndexes();
      const orgFolderIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('folder')
      );
      expect(orgFolderIndex).toBeDefined();
    });

    it('should have index on organization and uploadedBy', async () => {
      const indexes = await DocumentModel.collection.getIndexes();
      const orgUserIndex = Object.keys(indexes).find(
        key => key.includes('organization') && key.includes('uploadedBy')
      );
      expect(orgUserIndex).toBeDefined();
    });

    it('should have index on uploadedBy and createdAt for recent documents', async () => {
      const indexes = await DocumentModel.collection.getIndexes();
      const recentIndex = Object.keys(indexes).find(
        key => key.includes('uploadedBy') && key.includes('createdAt')
      );
      expect(recentIndex).toBeDefined();
    });

    it('should have index on sharedWith', async () => {
      const indexes = await DocumentModel.collection.getIndexes();
      const sharedIndex = Object.keys(indexes).find(key => key.includes('sharedWith'));
      expect(sharedIndex).toBeDefined();
    });
  });

  describe('Timestamps', () => {
    it('should set uploadedAt, createdAt and updatedAt automatically', async () => {
      const document = await DocumentModel.create({
        filename: 'timestamp-test.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/timestamp-test.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      expect(document.uploadedAt).toBeInstanceOf(Date);
      expect(document.createdAt).toBeInstanceOf(Date);
      expect(document.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain url field for backward compatibility', async () => {
      const document = await DocumentModel.create({
        filename: 'legacy-doc.pdf',
        url: 'https://example.com/files/legacy-doc.pdf',
        uploadedBy: testUserId,
        organization: testOrgId,
        folder: testFolderId,
        path: '/path/legacy-doc.pdf',
        size: 1000,
        mimeType: 'application/pdf'
      });

      expect(document.url).toBe('https://example.com/files/legacy-doc.pdf');
    });
  });
});
