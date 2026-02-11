export {};
// Unit tests for document.service.ts (focus on branches)
jest.resetModules();

const mockDocumentFindById = jest.fn();
const mockDocumentFindByIdAndUpdate = jest.fn();
const mockDocumentFindByIdAndDelete = jest.fn();
const mockUserFindById = jest.fn();
const mockFolderFindById = jest.fn();
const mockOrganizationFindById = jest.fn();

jest.mock('../../../src/models/document.model', () => ({
  __esModule: true,
  default: {
    findById: mockDocumentFindById,
    findByIdAndUpdate: mockDocumentFindByIdAndUpdate,
    findByIdAndDelete: mockDocumentFindByIdAndDelete
  }
}));

jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      lean: jest.fn()
    })),
    findById: mockUserFindById
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
  validateFolderAccess: jest.fn()
}));

jest.mock('../../../src/services/search.service', () => ({
  removeDocumentFromIndex: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  unlinkSync: jest.fn()
}));

afterEach(() => {
  jest.clearAllMocks();
});

describe('document.service (unit - branches)', () => {
  describe('shareDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: 'invalid', userId: 'u1', userIds: ['u2'] }))
        .rejects.toThrow('Invalid document id');
    });

    it('should throw 400 when userIds is empty array', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: 'u1', userIds: [] }))
        .rejects.toThrow('userIds must be a non-empty array');
    });

    it('should throw 400 when no valid user ids after filtering', async () => {
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: 'u1', userIds: ['invalid', 'bad'] }))
        .rejects.toThrow('At least one valid user id is required');
    });

    it('should throw error when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: 'u1', userIds: ['507f1f77bcf86cd799439012'] }))
        .rejects.toThrow('Document not found');
    });

    it('should throw 403 when user is not document owner', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: 'owner1' });
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: 'otherUser', userIds: ['507f1f77bcf86cd799439012'] }))
        .rejects.toThrow('Forbidden');
    });

    it('should throw 400 when trying to share with owner only', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: '507f1f77bcf86cd799439011' });
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439011', userIds: ['507f1f77bcf86cd799439011'] }))
        .rejects.toThrow('Cannot share document with yourself as the owner');
    });

    it('should throw 400 when no valid users found', async () => {
      const mockLean = jest.fn().mockResolvedValue([]);
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: '507f1f77bcf86cd799439011' });
      const User = require('../../../src/models/user.model').default;
      User.find.mockReturnValue({ lean: mockLean });
      
      const { shareDocument } = require('../../../src/services/document.service');
      await expect(shareDocument({ id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439011', userIds: ['507f1f77bcf86cd799439012'] }))
        .rejects.toThrow('No valid users found to share with');
    });

    it('should successfully share document with valid users', async () => {
      const mockLean = jest.fn().mockResolvedValue([{ _id: '507f1f77bcf86cd799439012' }]);
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: '507f1f77bcf86cd799439011' });
      const User = require('../../../src/models/user.model').default;
      User.find.mockReturnValue({ lean: mockLean });
      mockDocumentFindByIdAndUpdate.mockResolvedValue({ _id: 'd1', sharedWith: ['507f1f77bcf86cd799439012'] });
      
      const { shareDocument } = require('../../../src/services/document.service');
      const result = await shareDocument({ id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439011', userIds: ['507f1f77bcf86cd799439012'] });
      
      expect(result).toBeDefined();
      expect(mockDocumentFindByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: 'invalid', userId: 'u1' }))
        .rejects.toThrow('Invalid document id');
    });

    it('should throw error when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: '507f1f77bcf86cd799439011', userId: 'u1' }))
        .rejects.toThrow('Document not found');
    });

    it('should throw 403 when user is not owner', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: 'owner1' });
      const { deleteDocument } = require('../../../src/services/document.service');
      await expect(deleteDocument({ id: '507f1f77bcf86cd799439011', userId: 'otherUser' }))
        .rejects.toThrow('Forbidden');
    });

    it('should delete document and update user storage when user found', async () => {
      const saveMock = jest.fn();
      mockDocumentFindById.mockResolvedValue({ 
        _id: 'd1', 
        uploadedBy: '507f1f77bcf86cd799439011',
        size: 1000,
        filename: 'test.pdf'
      });
      mockUserFindById.mockResolvedValue({ _id: 'u1', storageUsed: 5000, save: saveMock });
      mockDocumentFindByIdAndDelete.mockResolvedValue({ _id: 'd1' });
      
      const { deleteDocument } = require('../../../src/services/document.service');
      const result = await deleteDocument({ id: '507f1f77bcf86cd799439011', userId: '507f1f77bcf86cd799439011' });
      
      expect(result).toBeDefined();
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('moveDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(moveDocument({ documentId: 'invalid', userId: 'u1', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('Invalid document ID');
    });

    it('should throw 400 on invalid target folder id', async () => {
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(moveDocument({ documentId: '507f1f77bcf86cd799439011', userId: 'u1', targetFolderId: 'invalid' }))
        .rejects.toThrow('Invalid target folder ID');
    });

    it('should throw 404 when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(moveDocument({ documentId: '507f1f77bcf86cd799439011', userId: 'u1', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('Document not found');
    });

    it('should throw 403 when user is not document owner', async () => {
      mockDocumentFindById.mockResolvedValue({ _id: 'd1', uploadedBy: 'owner1' });
      const { moveDocument } = require('../../../src/services/document.service');
      await expect(moveDocument({ documentId: '507f1f77bcf86cd799439011', userId: 'otherUser', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('Only document owner can move it');
    });
  });

  describe('copyDocument', () => {
    it('should throw 400 on invalid document id', async () => {
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(copyDocument({ documentId: 'invalid', userId: 'u1', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('Invalid document ID');
    });

    it('should throw 404 when document not found', async () => {
      mockDocumentFindById.mockResolvedValue(null);
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(copyDocument({ documentId: '507f1f77bcf86cd799439011', userId: 'u1', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('Document not found');
    });

    it('should throw 403 when user has no access to document', async () => {
      mockDocumentFindById.mockResolvedValue({ 
        _id: 'd1', 
        uploadedBy: 'owner1',
        sharedWith: []
      });
      const { copyDocument } = require('../../../src/services/document.service');
      await expect(copyDocument({ documentId: '507f1f77bcf86cd799439011', userId: 'otherUser', targetFolderId: '507f1f77bcf86cd799439012' }))
        .rejects.toThrow('You do not have access to this document');
    });
  });
});
