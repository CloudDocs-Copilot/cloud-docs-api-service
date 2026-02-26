import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as path from 'path';

import * as documentService from '../../../src/services/document.service';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';
import Folder from '../../../src/models/folder.model';
import Document from '../../../src/models/document.model';

// ---- mocks (external collaborators / cross-service concerns) ----
jest.mock('../../../src/services/membership.service', () => ({
  getActiveOrganization: jest.fn(),
  getMembership: jest.fn(),
  hasAnyRole: jest.fn()
}));

jest.mock('../../../src/services/folder.service', () => ({
  validateFolderAccess: jest.fn()
}));

jest.mock('../../../src/services/search.service', () => ({
  indexDocument: jest.fn(),
  removeDocumentFromIndex: jest.fn()
}));

jest.mock('../../../src/services/notification.service', () => ({
  notifyOrganizationMembers: jest.fn(),
  createNotificationForUser: jest.fn()
}));

jest.mock('../../../src/socket/socket', () => ({
  emitToUser: jest.fn()
}));

jest.mock('../../../src/jobs/process-document-ai.job', () => ({
  processDocumentAI: jest.fn()
}));

jest.mock('../../../src/services/ai/text-extraction.service', () => ({
  textExtractionService: {
    isSupportedMimeType: jest.fn()
  }
}));

import * as membershipService from '../../../src/services/membership.service';
import * as folderService from '../../../src/services/folder.service';
import * as searchService from '../../../src/services/search.service';
import * as notificationService from '../../../src/services/notification.service';
import * as aiJob from '../../../src/jobs/process-document-ai.job';
import { textExtractionService } from '../../../src/services/ai/text-extraction.service';
import { emitToUser } from '../../../src/socket/socket';

let mongoServer: MongoMemoryServer;

type TestMulterFile = {
  filename: string;
  originalname: string;
  mimetype?: string;
  size?: number;
  path?: string;
  destination?: string;
  buffer?: Buffer;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertHasAccessFields(
  value: unknown
): asserts value is { accessType: unknown; isOwned: unknown } {
  if (!isRecord(value)) throw new Error('Expected object');
  if (!('accessType' in value)) throw new Error('Expected accessType');
  if (!('isOwned' in value)) throw new Error('Expected isOwned');
}

describe('DocumentService Integration-ish Tests (mongo + fs, mocked collaborators)', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testOrgId: mongoose.Types.ObjectId;
  let testOrgSlug: string;
  let rootFolderId: mongoose.Types.ObjectId;
  let docsFolderId: mongoose.Types.ObjectId;

  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const storageRoot = path.join(process.cwd(), 'storage');

  function ensureDir(p: string): void {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  function safeRmDir(p: string): void {
    if (!fs.existsSync(p)) return;
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (err: unknown) {
      if (isRecord(err) && typeof err.code === 'string') {
        if (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM') {
          // ignore in tests
          return;
        }
      }
      throw err;
    }
  }

  function physicalFromDocPath(docPath: string): string {
    const rel = docPath.startsWith('/') ? docPath.substring(1) : docPath;
    return path.join(storageRoot, rel);
  }

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // clean DB
    await User.deleteMany({});
    await Organization.deleteMany({});
    await Folder.deleteMany({});
    await Document.deleteMany({});

    // clean FS
    safeRmDir(uploadsRoot);
    safeRmDir(storageRoot);
    ensureDir(uploadsRoot);
    ensureDir(storageRoot);

    // Create org + users
    const owner = await User.create({
      name: 'Org Owner',
      email: 'owner@test.com',
      password: 'hashedPassword123',
      role: 'admin',
      storageUsed: 0,
      active: true
    });

    const user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'hashedPassword123',
      role: 'user',
      storageUsed: 0,
      active: true
    });

    const user2 = await User.create({
      name: 'Test User 2',
      email: 'user2@test.com',
      password: 'hashedPassword123',
      role: 'user',
      storageUsed: 0,
      active: true
    });

    const org = await Organization.create({
      name: 'Test Organization',
      owner: owner._id,
      members: [owner._id, user._id, user2._id]
    });

    testOrgId = org._id as mongoose.Types.ObjectId;

    // read the real slug produced by the model
    const orgReloaded = await Organization.findById(testOrgId);
    testOrgSlug = orgReloaded?.slug || 'test-organization';

    testUserId = user._id as mongoose.Types.ObjectId;
    testUser2Id = user2._id as mongoose.Types.ObjectId;

    // IMPORTANT: uploadDocument aggregates by User.organization, so set it.
    await User.findByIdAndUpdate(testUserId, { organization: testOrgId });
    await User.findByIdAndUpdate(testUser2Id, { organization: testOrgId });

    // Root folder + Docs folder in org
    const rootFolder = await Folder.create({
      name: `root_${testOrgSlug}_${testUserId}`,
      displayName: 'My Files',
      type: 'root',
      organization: testOrgId,
      owner: testUserId,
      path: `/${testOrgSlug}/${testUserId.toString()}`,
      isRoot: true,
      permissions: [{ userId: testUserId, role: 'owner' }]
    });
    rootFolderId = rootFolder._id as mongoose.Types.ObjectId;

    const docsFolder = await Folder.create({
      name: 'Documents',
      displayName: 'My Documents',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: rootFolderId,
      path: `/${testOrgSlug}/${testUserId.toString()}/Documents`,
      isRoot: false,
      permissions: [{ userId: testUserId, role: 'owner' }]
    });
    docsFolderId = docsFolder._id as mongoose.Types.ObjectId;

    // Ensure physical folder exists for storage writes (real slug)
    ensureDir(path.join(storageRoot, testOrgSlug, testUserId.toString(), 'Documents'));

    // Default membership mocks for "active org"
    (membershipService.getActiveOrganization as jest.Mock).mockImplementation(
      async (uid: string) => {
        if (uid === testUserId.toString() || uid === testUser2Id.toString())
          return testOrgId.toString();
        return null;
      }
    );

    (membershipService.getMembership as jest.Mock).mockImplementation(
      async (uid: string, orgId: string) => {
        if (orgId !== testOrgId.toString()) return null;
        if (uid === testUserId.toString()) return { rootFolder: rootFolderId };
        if (uid === testUser2Id.toString()) return { rootFolder: rootFolderId };
        return null;
      }
    );

    (folderService.validateFolderAccess as jest.Mock).mockResolvedValue(undefined);
    (membershipService.hasAnyRole as jest.Mock).mockResolvedValue(false);

    (searchService.indexDocument as jest.Mock).mockResolvedValue(undefined);
    (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

    (notificationService.notifyOrganizationMembers as jest.Mock).mockResolvedValue(undefined);
    (notificationService.createNotificationForUser as jest.Mock).mockResolvedValue(undefined);

    // AI defaults (avoid async job noise unless test opts in)
    (textExtractionService.isSupportedMimeType as jest.Mock).mockReturnValue(false);
    (aiJob.processDocumentAI as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    safeRmDir(uploadsRoot);
    safeRmDir(storageRoot);
  });

  describe('uploadDocument', () => {
    it('should upload document into storage + create DB record + update user.storageUsed', async () => {
      const testFileName = `test-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsRoot, testFileName);
      fs.writeFileSync(tempFilePath, 'Test content');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 12
      };

      const doc = await documentService.uploadDocument({
        file: mockFile as unknown as Express.Multer.File,
        userId: testUserId.toString(),
        folderId: docsFolderId.toString()
      });

      expect(doc).toBeDefined();
      expect(doc.filename).toBe(testFileName);
      expect(doc.originalname).toBe('test.txt');
      expect(doc.organization?.toString()).toBe(testOrgId.toString());
      expect(doc.folder?.toString()).toBe(docsFolderId.toString());
      expect(doc.size).toBe(12);
      expect((doc as unknown as { aiProcessingStatus?: unknown }).aiProcessingStatus).toBe('pending');

      const expectedPhysical = physicalFromDocPath(doc.path as string);

      expect(fs.existsSync(expectedPhysical)).toBe(true);
      expect(fs.existsSync(tempFilePath)).toBe(false);

      const updatedUser = await User.findById(testUserId);
      expect(updatedUser?.storageUsed).toBe(12);

      expect(searchService.indexDocument).toHaveBeenCalled();
      // NOTE: upload is private by default now -> should NOT notify entire org
      expect(notificationService.notifyOrganizationMembers).not.toHaveBeenCalled();
    });

    it('should trigger AI processing when supported mime type (fire-and-forget)', async () => {
      (textExtractionService.isSupportedMimeType as jest.Mock).mockReturnValueOnce(true);

      const testFileName = `ai-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsRoot, testFileName);
      fs.writeFileSync(tempFilePath, 'AI content');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'ai.txt',
        mimetype: 'text/plain',
        size: 10
      };

      const doc = await documentService.uploadDocument({
        file: mockFile as unknown as Express.Multer.File,
        userId: testUserId.toString(),
        folderId: docsFolderId.toString()
      });

      expect(doc).toBeDefined();
      expect(aiJob.processDocumentAI).toHaveBeenCalledWith(doc._id.toString());
    });

    it('should use membership.rootFolder when folderId is not provided', async () => {
      const testFileName = `root-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsRoot, testFileName);
      fs.writeFileSync(tempFilePath, 'Hello root');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'root.txt',
        mimetype: 'text/plain',
        size: 10
      };

      ensureDir(path.join(storageRoot, testOrgSlug, testUserId.toString()));

      const doc = await documentService.uploadDocument({
        file: mockFile as unknown as Express.Multer.File,
        userId: testUserId.toString(),
        folderId: undefined
      });

      expect(doc.folder?.toString()).toBe(rootFolderId.toString());
      expect(doc.organization?.toString()).toBe(testOrgId.toString());
    });

    it('should write buffer if file is not found in candidate paths (memory storage branch)', async () => {
      const testFileName = `buf-${Date.now()}.txt`;
      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'buf.txt',
        mimetype: 'text/plain',
        size: 4,
        buffer: Buffer.from('buf!')
      };

      const doc = await documentService.uploadDocument({
        file: mockFile as unknown as Express.Multer.File,
        userId: testUserId.toString(),
        folderId: docsFolderId.toString()
      });

      const expectedPhysical = physicalFromDocPath(doc.path as string);
      expect(fs.existsSync(expectedPhysical)).toBe(true);
      expect(fs.readFileSync(expectedPhysical, 'utf8')).toBe('buf!');
    });

    it('should fail when membership has no rootFolder and folderId is not provided/empty', async () => {
      (membershipService.getMembership as jest.Mock).mockResolvedValueOnce({
        rootFolder: undefined
      });

      const mockFile: TestMulterFile = {
        filename: 'no-root.txt',
        originalname: 'no-root.txt',
        mimetype: 'text/plain',
        size: 1
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: ''
        })
      ).rejects.toThrow('Membership does not have a root folder. Please contact support.');
    });

    it('should fail if folder does not belong to active organization', async () => {
      const otherOrg = await Organization.create({
        name: 'Other Org',
        owner: testUserId,
        members: [testUserId]
      });

      const otherOrgReloaded = await Organization.findById(otherOrg._id);
      const otherSlug = otherOrgReloaded?.slug || 'other-org';

      const otherFolder = await Folder.create({
        name: 'OtherDocs',
        displayName: 'Other Docs',
        type: 'folder',
        organization: otherOrg._id,
        owner: testUserId,
        parent: rootFolderId,
        path: `/${otherSlug}/${testUserId.toString()}/OtherDocs`,
        isRoot: false,
        permissions: [{ userId: testUserId, role: 'owner' }]
      });

      const testFileName = `x-${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadsRoot, testFileName), 'x');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'x.txt',
        mimetype: 'text/plain',
        size: 1
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: otherFolder._id.toString()
        })
      ).rejects.toThrow('Folder does not belong to your active organization');
    });

    it('should fail if user storage quota is exceeded', async () => {
      const org = await Organization.findById(testOrgId);
      org!.settings.maxStoragePerUser = 10;
      await org!.save();

      await User.findByIdAndUpdate(testUserId, { storageUsed: 9 });

      const testFileName = `big-${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadsRoot, testFileName), '12345');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'big.txt',
        mimetype: 'text/plain',
        size: 5
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: docsFolderId.toString()
        })
      ).rejects.toThrow(/Storage quota exceeded/i);
    });

    it('should fail if organization total storage quota is exceeded (maxStorageTotal != -1)', async () => {
      const org = await Organization.findById(testOrgId);
      org!.settings.maxStorageTotal = 10;
      await org!.save();

      await User.updateMany({ organization: testOrgId }, { $set: { storageUsed: 0 } });
      await User.findByIdAndUpdate(testUserId, { storageUsed: 9 });

      const testFileName = `org-total-${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadsRoot, testFileName), 'xx');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'org-total.txt',
        mimetype: 'text/plain',
        size: 2
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: docsFolderId.toString()
        })
      ).rejects.toThrow(/Organization storage quota exceeded/i);
    });

    it('should fail if file type is not allowed by organization settings', async () => {
      const org = await Organization.findById(testOrgId);
      org!.settings.allowedFileTypes = ['pdf'];
      await org!.save();

      const testFileName = `badext-${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadsRoot, testFileName), 'x');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'bad.txt',
        mimetype: 'text/plain',
        size: 1
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: docsFolderId.toString()
        })
      ).rejects.toThrow(/File type 'txt' not allowed/i);
    });

    it('should fail if validateFolderAccess rejects (no editor access)', async () => {
      (folderService.validateFolderAccess as jest.Mock).mockRejectedValueOnce(
        new Error('User does not have editor access to this folder')
      );

      const testFileName = `noaccess-${Date.now()}.txt`;
      fs.writeFileSync(path.join(uploadsRoot, testFileName), 'x');

      const mockFile: TestMulterFile = {
        filename: testFileName,
        originalname: 'noaccess.txt',
        mimetype: 'text/plain',
        size: 1
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile as unknown as Express.Multer.File,
          userId: testUserId.toString(),
          folderId: docsFolderId.toString()
        })
      ).rejects.toThrow('User does not have editor access to this folder');
    });
  });

  describe('listDocuments', () => {
    it('should list documents from active organization', async () => {
      await Document.create({
        filename: 'a.txt',
        originalname: 'a.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/a.txt`,
        url: `/storage/${testOrgSlug}/${testUserId.toString()}/Documents/a.txt`
      });

      const docs = await documentService.listDocuments(testUserId.toString());
      expect(docs).toHaveLength(1);
      expect(docs[0].organization?.toString()).toBe(testOrgId.toString());
    });

    it('should fail if no active organization', async () => {
      (membershipService.getActiveOrganization as jest.Mock).mockResolvedValueOnce(null);

      await expect(documentService.listDocuments(testUserId.toString())).rejects.toThrow(
        'No existe una organización activa. Por favor, crea o únete a una organización primero.'
      );
    });
  });

  describe('findDocumentById', () => {
    it('should fail for invalid id', async () => {
      await expect(documentService.findDocumentById('not-an-id')).rejects.toThrow(
        'Invalid document ID'
      );
    });

    it('should find by id for valid id', async () => {
      const created = await Document.create({
        filename: 'a.txt',
        originalname: 'a.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/a.txt`
      });

      const found = await documentService.findDocumentById(created._id.toString());
      expect(found?._id.toString()).toBe(created._id.toString());
    });
  });

  describe('getUserRecentDocuments', () => {
    it('should return recent documents sorted desc and include accessType/isOwned', async () => {
      await Document.create({
        filename: 'old.txt',
        originalname: 'old.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/old.txt`,
        createdAt: new Date('2024-01-01')
      });

      await Document.create({
        filename: 'new.txt',
        originalname: 'new.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUser2Id,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUser2Id.toString()}/Documents/new.txt`,
        createdAt: new Date('2024-01-02')
      });

      const recent = await documentService.getUserRecentDocuments({
        userId: testUserId.toString(),
        limit: 10
      });

      expect(recent).toHaveLength(2);
      expect((recent[0] as unknown as { originalname?: unknown }).originalname).toBe('new.txt');
      expect((recent[1] as unknown as { originalname?: unknown }).originalname).toBe('old.txt');

      assertHasAccessFields(recent[0]);
      assertHasAccessFields(recent[1]);

      expect((recent[0] as unknown as { accessType: unknown }).accessType).toBe('org');
      expect((recent[0] as unknown as { isOwned: unknown }).isOwned).toBe(false);

      expect((recent[1] as unknown as { accessType: unknown }).accessType).toBe('owner');
      expect((recent[1] as unknown as { isOwned: unknown }).isOwned).toBe(true);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await Document.create({
          filename: `doc${i}.txt`,
          originalname: `doc${i}.txt`,
          mimeType: 'text/plain',
          size: 1,
          uploadedBy: testUserId,
          folder: docsFolderId,
          organization: testOrgId,
          path: `/${testOrgSlug}/${testUserId.toString()}/Documents/doc${i}.txt`,
          createdAt: new Date(Date.now() + i)
        });
      }

      const recent = await documentService.getUserRecentDocuments({
        userId: testUserId.toString(),
        limit: 3
      });

      expect(recent).toHaveLength(3);
    });
  });

  describe('listSharedDocumentsToUser', () => {
    it('should list org documents excluding those uploadedBy the user', async () => {
      await Document.create({
        filename: 'mine.txt',
        originalname: 'mine.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/mine.txt`
      });

      await Document.create({
        filename: 'theirs.txt',
        originalname: 'theirs.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUser2Id,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUser2Id.toString()}/Documents/theirs.txt`,
        sharedWith: [testUserId]
      });

      const shared = await documentService.listSharedDocumentsToUser(testUserId.toString());
      expect(shared).toHaveLength(1);
      expect((shared[0] as unknown as { originalname?: unknown }).originalname).toBe('theirs.txt');
    });

    it('should fail if invalid userId', async () => {
      await expect(documentService.listSharedDocumentsToUser('bad')).rejects.toThrow(
        'Invalid user ID'
      );
    });
  });

  describe('shareDocument', () => {
    it('should share org document only to active members and create notifications per recipient', async () => {
      const doc = await Document.create({
        filename: 'orgdoc.txt',
        originalname: 'orgdoc.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/orgdoc.txt`
      });

      // actor user "name/email" for message
      (User.findById as unknown as jest.Mock | undefined);

      const updated = await documentService.shareDocument({
        id: doc._id.toString(),
        userId: testUserId.toString(),
        userIds: [testUser2Id.toString()]
      });

      expect(updated?._id.toString()).toBe(doc._id.toString());

      // doc is org => validate recipients via getMembership
      expect(membershipService.getMembership).toHaveBeenCalledWith(testUser2Id.toString(), testOrgId.toString());

      // notifications for selected recipients (persist + realtime)
      expect(notificationService.createNotificationForUser).toHaveBeenCalledTimes(1);
      expect(notificationService.createNotificationForUser).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: testOrgId.toString(),
          recipientUserId: testUser2Id.toString(),
          actorUserId: testUserId.toString(),
          type: 'DOC_SHARED',
          entityKind: 'document',
          entityId: doc._id.toString(),
          emitter: expect.any(Function)
        })
      );

      // ensure we still do NOT use org-wide notifier here
      expect(notificationService.notifyOrganizationMembers).not.toHaveBeenCalled();

      // optionally execute emitter to verify it routes to socket
      const call = (notificationService.createNotificationForUser as jest.Mock).mock.calls[0][0] as {
        emitter: (recipientUserId: string, payload: unknown) => void;
      };
      call.emitter(testUser2Id.toString(), { hello: 'world' });
      expect(emitToUser).toHaveBeenCalledWith(testUser2Id.toString(), 'notification:new', { hello: 'world' });
    });

    it('should share personal document with existing users (excluding owner)', async () => {
      const doc = await Document.create({
        filename: 'personal.txt',
        originalname: 'personal.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: undefined,
        path: `/personal/${testUserId.toString()}/personal.txt`
      });

      const updated = await documentService.shareDocument({
        id: doc._id.toString(),
        userId: testUserId.toString(),
        userIds: [testUser2Id.toString(), testUserId.toString()]
      });

      expect(updated).toBeDefined();
      const reloaded = await Document.findById(doc._id);
      expect(reloaded?.sharedWith?.map(x => x.toString())).toContain(testUser2Id.toString());
      expect(reloaded?.sharedWith?.map(x => x.toString())).not.toContain(testUserId.toString());
    });

    it('should fail if trying to share only with self (owner)', async () => {
      const doc = await Document.create({
        filename: 'personal2.txt',
        originalname: 'personal2.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        organization: undefined,
        folder: docsFolderId,
        path: `/personal/${testUserId.toString()}/personal2.txt`
      });

      await expect(
        documentService.shareDocument({
          id: doc._id.toString(),
          userId: testUserId.toString(),
          userIds: [testUserId.toString()]
        })
      ).rejects.toThrow('Cannot share document with yourself as the owner');
    });
  });

  describe('replaceDocumentFile', () => {
    it('should allow uploadedBy to replace file in org doc and adjust storage delta', async () => {
      const org = await Organization.findById(testOrgId);
      org!.settings.allowedFileTypes = ['txt'];
      org!.settings.maxStoragePerUser = 1000;
      await org!.save();

      const filename = `replace-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const physical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(physical));
      fs.writeFileSync(physical, 'old'); // 3 bytes

      const doc = await Document.create({
        filename,
        originalname: 'old.txt',
        mimeType: 'text/plain',
        size: 3,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath,
        url: `/storage${docPath}`
      });

      await User.findByIdAndUpdate(testUserId, { storageUsed: 10 });

      const tempName = `temp-${Date.now()}.txt`;
      const tempPath = path.join(uploadsRoot, tempName);
      fs.writeFileSync(tempPath, 'new-content'); // 11 bytes

      const mockFile: TestMulterFile = {
        filename: tempName,
        originalname: 'new.txt',
        mimetype: 'text/plain',
        size: 11
      };

      const updated = await documentService.replaceDocumentFile({
        documentId: doc._id.toString(),
        userId: testUserId.toString(),
        file: mockFile as unknown as Express.Multer.File
      });

      expect(updated.originalname).toBe('new.txt');
      expect(updated.size).toBe(11);

      expect(fs.existsSync(physical)).toBe(true);
      expect(fs.existsSync(tempPath)).toBe(false);

      const user = await User.findById(testUserId);
      expect(user?.storageUsed).toBe(18); // 10 + (11-3)

      expect(searchService.indexDocument).toHaveBeenCalled();
      expect(notificationService.notifyOrganizationMembers).toHaveBeenCalled();
    });

    it('should allow org admin/owner (hasAnyRole=true) to replace even if not uploadedBy', async () => {
      (membershipService.hasAnyRole as jest.Mock).mockResolvedValueOnce(true);

      const org = await Organization.findById(testOrgId);
      org!.settings.allowedFileTypes = ['txt'];
      org!.settings.maxStoragePerUser = 1000;
      await org!.save();

      const filename = `admin-replace-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const physical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(physical));
      fs.writeFileSync(physical, 'old');

      const doc = await Document.create({
        filename,
        originalname: 'old.txt',
        mimeType: 'text/plain',
        size: 3,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath
      });

      const tempName = `temp-admin-${Date.now()}.txt`;
      const tempPath = path.join(uploadsRoot, tempName);
      fs.writeFileSync(tempPath, 'new');

      const mockFile: TestMulterFile = {
        filename: tempName,
        originalname: 'new.txt',
        mimetype: 'text/plain',
        size: 3
      };

      await expect(
        documentService.replaceDocumentFile({
          documentId: doc._id.toString(),
          userId: testUser2Id.toString(),
          file: mockFile as unknown as Express.Multer.File
        })
      ).resolves.toBeDefined();
    });

    it('should fail if neither org admin nor doc owner', async () => {
      (membershipService.hasAnyRole as jest.Mock).mockResolvedValueOnce(false);

      const doc = await Document.create({
        filename: 'x.txt',
        originalname: 'x.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/x.txt`
      });

      const mockFile: TestMulterFile = {
        filename: 'temp.txt',
        originalname: 'temp.txt',
        mimetype: 'text/plain',
        size: 1
      };

      await expect(
        documentService.replaceDocumentFile({
          documentId: doc._id.toString(),
          userId: testUser2Id.toString(),
          file: mockFile as unknown as Express.Multer.File
        })
      ).rejects.toThrow('No tienes permisos para editar este documento');
    });
  });

  describe('deleteDocument', () => {
    it('should delete org document only if org OWNER/ADMIN', async () => {
      const filename = `del-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const physical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(physical));
      fs.writeFileSync(physical, 'delete-me');

      const doc = await Document.create({
        filename,
        originalname: 'del.txt',
        mimeType: 'text/plain',
        size: 9,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath,
        url: `/storage${docPath}`
      });

      await expect(
        documentService.deleteDocument({ id: doc._id.toString(), userId: testUserId.toString() })
      ).rejects.toThrow(
        'Solo el propietario o administradores de la organización pueden eliminar este documento'
      );

      (membershipService.hasAnyRole as jest.Mock).mockResolvedValueOnce(true);

      await User.findByIdAndUpdate(testUser2Id, { storageUsed: 20 });

      const deleted = await documentService.deleteDocument({
        id: doc._id.toString(),
        userId: testUser2Id.toString()
      });

      expect(deleted?._id.toString()).toBe(doc._id.toString());
      expect(fs.existsSync(physical)).toBe(false);
      expect(searchService.removeDocumentFromIndex).toHaveBeenCalledWith(doc._id.toString());
      expect(notificationService.notifyOrganizationMembers).toHaveBeenCalled();
    });

    it('should delete personal document only if uploadedBy', async () => {
      const filename = `personal-del-${Date.now()}.txt`;
      const docPath = `/personal/${testUserId.toString()}/${filename}`;
      const physical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(physical));
      fs.writeFileSync(physical, 'x');

      const doc = await Document.create({
        filename,
        originalname: 'p.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: undefined,
        path: docPath
      });

      await expect(
        documentService.deleteDocument({ id: doc._id.toString(), userId: testUser2Id.toString() })
      ).rejects.toThrow('Forbidden');

      await expect(
        documentService.deleteDocument({ id: doc._id.toString(), userId: testUserId.toString() })
      ).resolves.toBeDefined();
    });
  });

  describe('moveDocument', () => {
    it('should move document for owner and move physical file', async () => {
      const targetFolder = await Folder.create({
        name: 'Archive',
        displayName: 'Archive',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Archive`,
        permissions: [{ userId: testUserId, role: 'owner' }]
      });

      ensureDir(path.join(storageRoot, testOrgSlug, testUserId.toString(), 'Archive'));

      const filename = `move-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const oldPhysical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(oldPhysical));
      fs.writeFileSync(oldPhysical, 'to-move');

      const doc = await Document.create({
        filename,
        originalname: 'move.txt',
        mimeType: 'text/plain',
        size: 7,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath,
        url: `/storage${docPath}`
      });

      const moved = await documentService.moveDocument({
        documentId: doc._id.toString(),
        userId: testUserId.toString(),
        targetFolderId: targetFolder._id.toString()
      });

      expect(moved.folder?.toString()).toBe(targetFolder._id.toString());
      expect(moved.path).toContain('/Archive/');

      const newPhysical = physicalFromDocPath(moved.path as string);
      expect(fs.existsSync(oldPhysical)).toBe(false);
      expect(fs.existsSync(newPhysical)).toBe(true);
    });

    it('should fail if user is not owner', async () => {
      const doc = await Document.create({
        filename: 'x.txt',
        originalname: 'x.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/x.txt`
      });

      await expect(
        documentService.moveDocument({
          documentId: doc._id.toString(),
          userId: testUser2Id.toString(),
          targetFolderId: docsFolderId.toString()
        })
      ).rejects.toThrow('Only document owner can move it');
    });
  });

  describe('copyDocument', () => {
    it('should copy document (owner) and increase storageUsed', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

      const targetFolder = await Folder.create({
        name: 'Backup',
        displayName: 'Backup',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Backup`,
        permissions: [{ userId: testUserId, role: 'owner' }]
      });

      ensureDir(path.join(storageRoot, testOrgSlug, testUserId.toString(), 'Backup'));

      const filename = `copy-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const sourcePhysical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(sourcePhysical));
      fs.writeFileSync(sourcePhysical, 'to-copy');

      const doc = await Document.create({
        filename,
        originalname: 'original.txt',
        mimeType: 'text/plain',
        size: 7,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath,
        url: `/storage${docPath}`
      });

      await User.findByIdAndUpdate(testUserId, { storageUsed: 10 });

      const copied = await documentService.copyDocument({
        documentId: doc._id.toString(),
        userId: testUserId.toString(),
        targetFolderId: targetFolder._id.toString()
      });

      expect(copied._id.toString()).not.toBe(doc._id.toString());
      expect(copied.folder?.toString()).toBe(targetFolder._id.toString());
      expect(copied.originalname).toContain('Copy of');

      const user = await User.findById(testUserId);
      expect(user?.storageUsed).toBe(17);

      nowSpy.mockRestore();
    });

    it('should fail if user does not have access (not uploadedBy and not sharedWith)', async () => {
      const doc = await Document.create({
        filename: 'noaccess.txt',
        originalname: 'noaccess.txt',
        mimeType: 'text/plain',
        size: 1,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId.toString()}/Documents/noaccess.txt`
      });

      await expect(
        documentService.copyDocument({
          documentId: doc._id.toString(),
          userId: testUser2Id.toString(),
          targetFolderId: docsFolderId.toString()
        })
      ).rejects.toThrow('You do not have access to this document');
    });

    it('should fail if storage quota exceeded', async () => {
      const org = await Organization.findById(testOrgId);
      org!.settings.maxStoragePerUser = 10;
      await org!.save();

      await User.findByIdAndUpdate(testUserId, { storageUsed: 9 });

      const filename = `quota-${Date.now()}.txt`;
      const docPath = `/${testOrgSlug}/${testUserId.toString()}/Documents/${filename}`;
      const sourcePhysical = physicalFromDocPath(docPath);
      ensureDir(path.dirname(sourcePhysical));
      fs.writeFileSync(sourcePhysical, 'x'.repeat(5));

      const doc = await Document.create({
        filename,
        originalname: 'quota.txt',
        mimeType: 'text/plain',
        size: 5,
        uploadedBy: testUserId,
        folder: docsFolderId,
        organization: testOrgId,
        path: docPath
      });

      await expect(
        documentService.copyDocument({
          documentId: doc._id.toString(),
          userId: testUserId.toString(),
          targetFolderId: docsFolderId.toString()
        })
      ).rejects.toThrow('Storage quota exceeded');
    });
  });
});