// document.service.spec.ts
export {};
// Unit tests for document.service.ts (focus on branches)
jest.resetModules();

const mockDocumentFindById = jest.fn();
const mockDocumentFindByIdAndUpdate = jest.fn();
const mockDocumentFindByIdAndDelete = jest.fn();
const mockDocumentCreate = jest.fn();

const mockUserFindById = jest.fn();
const mockUserFind = jest.fn();

const mockFolderFindById = jest.fn();
const mockOrganizationFindById = jest.fn();

const mockValidateFolderAccess = jest.fn();

const mockGetActiveOrganization = jest.fn();
const mockGetMembership = jest.fn();
const mockHasAnyRole = jest.fn();

const mockIndexDocument = jest.fn();
const mockRemoveDocumentFromIndex = jest.fn();

const mockNotifyOrganizationMembers = jest.fn();
const mockEmitToUser = jest.fn();

const mockSanitizePathOrThrow = jest.fn((p: string) => p);
const mockIsPathWithinBase = jest.fn(() => true);

jest.mock('../../../src/models/document.model', () => ({
  __esModule: true,
  default: {
    findById: mockDocumentFindById,
    findByIdAndUpdate: mockDocumentFindByIdAndUpdate,
    findByIdAndDelete: mockDocumentFindByIdAndDelete,
    create: mockDocumentCreate
  }
}));

jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    findById: mockUserFindById,
    aggregate: jest.fn(async () => [])
  }
}));

jest.mock('../../../src/models/folder.model', () => ({
  __esModule: true,
  default: {
    findById: mockFolderFindById
  }
}));

jest.mock('../../../src/models/organization.model', () => ({
  __esModule: true,
  default: {
    findById: mockOrganizationFindById
  }
}));

jest.mock('../../../src/services/folder.service', () => ({
  validateFolderAccess: mockValidateFolderAccess
}));

jest.mock('../../../src/services/membership.service', () => ({
  getActiveOrganization: mockGetActiveOrganization,
  getMembership: mockGetMembership,
  hasAnyRole: mockHasAnyRole
}));

jest.mock('../../../src/services/search.service', () => ({
  indexDocument: mockIndexDocument,
  removeDocumentFromIndex: mockRemoveDocumentFromIndex
}));

jest.mock('../../../src/services/notification.service', () => ({
  notifyOrganizationMembers: mockNotifyOrganizationMembers
}));

jest.mock('../../../src/socket/socket', () => ({
  emitToUser: mockEmitToUser
}));

jest.mock('../../../src/utils/path-sanitizer', () => ({
  sanitizePathOrThrow: mockSanitizePathOrThrow,
  isPathWithinBase: mockIsPathWithinBase
}));

jest.mock('../../../src/models/types/organization.types', () => ({
  PLAN_LIMITS: {
    FREE: { maxFileSize: 10 * 1024 * 1024 },
    PRO: { maxFileSize: 100 * 1024 * 1024 }
  }
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  copyFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));

afterEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('document.service (unit - branches)', () => {
  const DOC_ID = '507f1f77bcf86cd799439011';
  const OWNER_ID = '507f1f77bcf86cd799439012';
  const OTHER_ID = '507f1f77bcf86cd799439013';
  const USER2_ID = '507f1f77bcf86cd799439014';
  const FOLDER_ID = '507f1f77bcf86cd799439015';

  describe('shareDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: 'invalid', userId: OWNER_ID, userIds: [USER2_ID] })
      ).rejects.toThrow('Invalid document id');
    });

    it('should throw 400 when userIds is empty array', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [] })).rejects.toThrow(
        'userIds must be a non-empty array'
      );
    });

    it('should throw 400 when no valid user ids after filtering', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: ['invalid', 'bad'] })
      ).rejects.toThrow('At least one valid user id is required');
    });

    it('should throw error when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [USER2_ID] })
      ).rejects.toThrow('Document not found');
    });

    it('should throw 403 when user is not document owner', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: DOC_ID, userId: OTHER_ID, userIds: [USER2_ID] })
      ).rejects.toThrow('Forbidden');
    });

    it('should return doc when document belongs to an organization (org-wide access)', async () => {
      const doc = { _id: DOC_ID, uploadedBy: OWNER_ID, organization: '507f1f77bcf86cd799439099' };
      mockDocumentFindById.mockResolvedValue(doc);

      const { shareDocument } = require('../../../src/services/document.service');
      const result = await shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [USER2_ID] });

      expect(result).toBe(doc);
      expect(mockDocumentFindByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should throw 400 when trying to share with owner only', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [OWNER_ID] })
      ).rejects.toThrow('Cannot share document with yourself as the owner');
    });

    it('should throw 400 when no valid users found', async () => {
      const User = require('../../../src/models/user.model').default;
      User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });

      const { shareDocument } = require('../../../src/services/document.service');
      await expect(
        shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [USER2_ID] })
      ).rejects.toThrow('No valid users found to share with');
    });

    it('should successfully share document with valid users', async () => {
      const User = require('../../../src/models/user.model').default;
      User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: USER2_ID }]) });

      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });
      mockDocumentFindByIdAndUpdate.mockResolvedValue({ _id: DOC_ID, sharedWith: [USER2_ID] });

      const { shareDocument } = require('../../../src/services/document.service');
      const result = await shareDocument({ id: DOC_ID, userId: OWNER_ID, userIds: [USER2_ID] });

      expect(result).toBeDefined();
      expect(mockDocumentFindByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: 'invalid', userId: OWNER_ID })).rejects.toThrow(
        'Invalid document id'
      );
    });

    it('should throw error when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: DOC_ID, userId: OWNER_ID })).rejects.toThrow(
        'Document not found'
      );
    });

    it('should throw 403 when user is not owner (personal doc)', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: DOC_ID, userId: OTHER_ID })).rejects.toThrow('Forbidden');
    });

    it('should delete document and update user storage when user found (personal doc)', async () => {
      const saveMock = jest.fn();

      mockDocumentFindById.mockResolvedValue({
        _id: DOC_ID,
        uploadedBy: OWNER_ID,
        size: 1000,
        filename: 'test.pdf',
        path: undefined
      });

      mockUserFindById.mockResolvedValue({ _id: OWNER_ID, storageUsed: 5000, save: saveMock });
      mockDocumentFindByIdAndDelete.mockResolvedValue({ _id: DOC_ID });

      const { deleteDocument } = require('../../../src/services/document.service');
      const result = await deleteDocument({ id: DOC_ID, userId: OWNER_ID });

      expect(result).toBeDefined();
      expect(saveMock).toHaveBeenCalled();
      expect(mockRemoveDocumentFromIndex).toHaveBeenCalledWith(DOC_ID);
    });

    it('should throw 403 when user is not OWNER/ADMIN for org doc', async () => {
      mockDocumentFindById.mockResolvedValue({
        _id: DOC_ID,
        uploadedBy: OWNER_ID,
        organization: '507f1f77bcf86cd799439099'
      });
      mockHasAnyRole.mockResolvedValue(false);

      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: DOC_ID, userId: OTHER_ID })).rejects.toThrow(
        'Solo el propietario o administradores de la organización pueden eliminar este documento'
      );
    });
  });

  describe('moveDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(
        moveDocument({ documentId: 'invalid', userId: OWNER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('Invalid document ID');
    });

    it('should throw 400 on invalid target folder id', async () => {
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(
        moveDocument({ documentId: DOC_ID, userId: OWNER_ID, targetFolderId: 'invalid' })
      ).rejects.toThrow('Invalid target folder ID');
    });

    it('should throw 404 when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(
        moveDocument({ documentId: DOC_ID, userId: OWNER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('Document not found');
    });

    it('should throw 403 when user is not document owner', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: DOC_ID, uploadedBy: OWNER_ID });
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(
        moveDocument({ documentId: DOC_ID, userId: OTHER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('Only document owner can move it');
    });
  });

  describe('copyDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(
        copyDocument({ documentId: 'invalid', userId: OWNER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('Invalid document ID');
    });

    it('should throw 400 on invalid target folder id', async () => {
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(
        copyDocument({ documentId: DOC_ID, userId: OWNER_ID, targetFolderId: 'invalid' })
      ).rejects.toThrow('Invalid target folder ID');
    });

    it('should throw 404 when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(
        copyDocument({ documentId: DOC_ID, userId: OWNER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('Document not found');
    });

    it('should throw 403 when user has no access to document', async () => {
      mockDocumentFindById.mockResolvedValue({
        _id: DOC_ID,
        uploadedBy: OWNER_ID,
        sharedWith: []
      });

      const { copyDocument } = require('../../../src/services/document.service');
      await expect(
        copyDocument({ documentId: DOC_ID, userId: OTHER_ID, targetFolderId: FOLDER_ID })
      ).rejects.toThrow('You do not have access to this document');

      expect(mockValidateFolderAccess).not.toHaveBeenCalled();
      expect(mockFolderFindById).not.toHaveBeenCalled();
    });
  });
});
