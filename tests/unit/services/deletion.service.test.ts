import { deletionService } from '../../../src/services/deletion.service';
import DocumentModel from '../../../src/models/document.model';
import DeletionAuditModel, {
  DeletionAction,
  DeletionStatus
} from '../../../src/models/deletion-audit.model';
import searchService from '../../../src/services/search.service';
import HttpError from '../../../src/models/error.model';
import { Types } from 'mongoose';
import User from '../../../src/models/user.model';
import * as notificationService from '../../../src/services/notification.service';

jest.mock('../../../src/models/document.model');
jest.mock('../../../src/models/deletion-audit.model');
jest.mock('../../../src/services/search.service');
jest.mock('fs/promises');
jest.mock('../../../src/models/user.model');
jest.mock('../../../src/services/notification.service');

describe('DeletionService', () => {
  const mockUserId = new Types.ObjectId().toString();
  const mockOrgId = new Types.ObjectId().toString();
  const mockDocId = new Types.ObjectId().toString();

  const mockContext = {
    userId: mockUserId,
    organizationId: mockOrgId,
    ipAddress: '192.168.1.1',
    userAgent: 'Jest Test Agent',
    reason: 'Test deletion'
  };

  const mockDocument = {
    _id: mockDocId,
    filename: 'test-document.pdf',
    originalname: 'test-document.pdf',
    size: 1024,
    mimeType: 'application/pdf',
    path: '/storage/test-document.pdf',
    organization: mockOrgId,
    isDeleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deletionReason: undefined,
    scheduledDeletionDate: undefined,
    isOwnedBy: jest.fn(),
    save: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks to avoid unresolved promises during async flows
    (User.findById as jest.Mock).mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve({ name: 'Test User', email: 'test@example.com' })
      })
    }));
    (notificationService.notifyMembersOfOrganization as unknown as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  describe('moveToTrash', () => {
    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should move document to trash successfully', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      await deletionService.moveToTrash(mockDocId, mockContext);

      expect(DocumentModel.findById).toHaveBeenCalledWith(mockDocId);
      expect(document.isOwnedBy).toHaveBeenCalledWith(mockContext.userId);
      expect(document.isDeleted).toBe(true);
      expect(document.deletedAt).toBeDefined();
      expect(document.deletedBy).toEqual(new Types.ObjectId(mockContext.userId));
      expect(document.deletionReason).toBe(mockContext.reason);
      expect(document.scheduledDeletionDate).toBeDefined();
      expect(document.save).toHaveBeenCalled();
      expect(DeletionAuditModel.create).toHaveBeenCalled();
      expect(searchService.removeDocumentFromIndex).toHaveBeenCalledWith(mockDocId);
    });

    it('should throw 404 when document not found', async () => {
      (DocumentModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(deletionService.moveToTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(404, 'Document not found')
      );
    });

    it('should throw 403 when user does not own document', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(false);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.moveToTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(403, 'You do not have permission to delete this document')
      );
    });

    it('should throw 400 when document is already deleted', async () => {
      const document = { ...mockDocument, isDeleted: true };
      document.isOwnedBy = jest.fn().mockReturnValue(true);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.moveToTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(400, 'Document is already in trash')
      );
    });

    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should continue when Elasticsearch fails', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockRejectedValue(new Error('ES error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await deletionService.moveToTrash(mockDocId, mockContext);

      expect(result).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to remove document from search index:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should create audit log with correct data', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      await deletionService.moveToTrash(mockDocId, mockContext);

      expect(DeletionAuditModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document: mockDocument._id,
          documentId: mockDocument._id,
          performedBy: mockContext.userId,
          organization: mockContext.organizationId,
          action: DeletionAction.SOFT_DELETE,
          status: DeletionStatus.COMPLETED,
          reason: mockContext.reason,
          ipAddress: mockContext.ipAddress,
          userAgent: mockContext.userAgent
        })
      );
    });
  });

  describe('restoreFromTrash', () => {
    it('should restore document from trash successfully', async () => {
      const document = {
        ...mockDocument,
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: new Types.ObjectId(mockUserId)
      };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.indexDocument as jest.Mock).mockResolvedValue(undefined);

      await deletionService.restoreFromTrash(mockDocId, mockContext);

      expect(document.isDeleted).toBe(false);
      expect(document.deletedAt).toBeUndefined();
      expect(document.deletedBy).toBeUndefined();
      expect(document.deletionReason).toBeUndefined();
      expect(document.scheduledDeletionDate).toBeUndefined();
      expect(document.save).toHaveBeenCalled();
      expect(searchService.indexDocument).toHaveBeenCalledWith(document);
    });

    it('should throw 404 when document not found', async () => {
      (DocumentModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(deletionService.restoreFromTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(404, 'Document not found')
      );
    });

    it('should throw 403 when user does not own document', async () => {
      const document = { ...mockDocument, isDeleted: true };
      document.isOwnedBy = jest.fn().mockReturnValue(false);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.restoreFromTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(403, 'You do not have permission to restore this document')
      );
    });

    it('should throw 400 when document is not in trash', async () => {
      const document = { ...mockDocument, isDeleted: false };
      document.isOwnedBy = jest.fn().mockReturnValue(true);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.restoreFromTrash(mockDocId, mockContext)).rejects.toThrow(
        new HttpError(400, 'Document is not in trash')
      );
    });

    it('should continue when Elasticsearch re-indexing fails', async () => {
      const document = {
        ...mockDocument,
        isDeleted: true,
        deletedAt: new Date()
      };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.indexDocument as jest.Mock).mockRejectedValue(new Error('ES error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await deletionService.restoreFromTrash(mockDocId, mockContext);

      expect(result).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to re-index document:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('permanentDelete', () => {
    it('should throw 404 when document not found', async () => {
      (DocumentModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(deletionService.permanentDelete(mockDocId, mockContext, {})).rejects.toThrow(
        new HttpError(404, 'Document not found')
      );
    });

    it('should throw 403 when user does not own document', async () => {
      const document = { ...mockDocument, isDeleted: true };
      document.isOwnedBy = jest.fn().mockReturnValue(false);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.permanentDelete(mockDocId, mockContext, {})).rejects.toThrow(
        new HttpError(403, 'You do not have permission to permanently delete this document')
      );
    });

    it('should throw 400 when document is not in trash', async () => {
      const document = { ...mockDocument, isDeleted: false };
      document.isOwnedBy = jest.fn().mockReturnValue(true);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);

      await expect(deletionService.permanentDelete(mockDocId, mockContext, {})).rejects.toThrow(
        new HttpError(400, 'Document must be in trash before permanent deletion')
      );
    });

    it('should create audit entry with PENDING status initially', async () => {
      const document = { ...mockDocument, isDeleted: true, path: '/test/path.pdf' };
      document.isOwnedBy = jest.fn().mockReturnValue(true);

      const mockAuditEntry = {
        save: jest.fn().mockResolvedValue({}),
        status: DeletionStatus.PENDING,
        overwriteMethod: undefined,
        overwritePasses: undefined,
        completedAt: undefined,
        errorMessage: undefined
      };

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue(mockAuditEntry);

      // Mock the secure overwrite to throw error so we can check audit entry creation
      jest
        .spyOn(deletionService as any, 'secureOverwriteFile')
        .mockRejectedValue(new Error('File error'));

      await expect(deletionService.permanentDelete(mockDocId, mockContext, {})).rejects.toThrow();

      expect(DeletionAuditModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: DeletionAction.PERMANENT_DELETE,
          status: DeletionStatus.PENDING
        })
      );
    });

    it('should handle secure overwrite options', async () => {
      const document = { ...mockDocument, isDeleted: true, path: '/test/path.pdf' };
      document.isOwnedBy = jest.fn().mockReturnValue(true);

      const mockAuditEntry = {
        save: jest.fn().mockResolvedValue({}),
        status: DeletionStatus.PENDING,
        overwriteMethod: undefined,
        overwritePasses: undefined
      };

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue(mockAuditEntry);

      jest
        .spyOn(deletionService as any, 'secureOverwriteFile')
        .mockRejectedValue(new Error('Mock error'));

      await expect(
        deletionService.permanentDelete(mockDocId, mockContext, { method: 'simple', passes: 3 })
      ).rejects.toThrow();

      expect(DeletionAuditModel.create).toHaveBeenCalled();
    });
  });

  describe('Error handling and edge cases', () => {
    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should handle null context gracefully', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      const minimalContext = {
        userId: mockUserId
      };

      const result = await deletionService.moveToTrash(mockDocId, minimalContext as any);

      expect(result).toBeDefined();
    });

    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should handle missing organization ID', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      const contextWithoutOrg = {
        userId: mockUserId,
        ipAddress: '192.168.1.1',
        userAgent: 'Test'
      };

      await deletionService.moveToTrash(mockDocId, contextWithoutOrg);

      expect(DeletionAuditModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: mockDocument.organization
        })
      );
    });

    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should calculate scheduled deletion date correctly', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockImplementation(function (this: any) {
        // Simulate what the real save does - scheduledDeletionDate gets set
        return Promise.resolve(this);
      });
      const now = Date.now();

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      await deletionService.moveToTrash(mockDocId, mockContext);

      // After moveToTrash, the service sets scheduledDeletionDate
      expect(document.scheduledDeletionDate).toBeDefined();

      if (document.scheduledDeletionDate) {
        const scheduledTime = new Date(document.scheduledDeletionDate).getTime();
        const expectedTime = now + 30 * 24 * 60 * 60 * 1000;

        // Allow 1 second difference for test execution time
        expect(Math.abs(scheduledTime - expectedTime)).toBeLessThan(1000);
      }
    });

    // FIXME: This test causes timeouts in CI (mock promise resolution issue)
    it('should preserve document snapshot in audit log', async () => {
      const document = { ...mockDocument };
      document.isOwnedBy = jest.fn().mockReturnValue(true);
      document.save = jest.fn().mockResolvedValue(document);

      (DocumentModel.findById as jest.Mock).mockResolvedValue(document);
      (DeletionAuditModel.create as jest.Mock).mockResolvedValue({});
      (searchService.removeDocumentFromIndex as jest.Mock).mockResolvedValue(undefined);

      await deletionService.moveToTrash(mockDocId, mockContext);

      expect(DeletionAuditModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentSnapshot: {
            filename: document.filename,
            originalname: document.originalname,
            size: document.size,
            mimeType: document.mimeType,
            path: document.path,
            organization: document.organization
          }
        })
      );
    });
  });
});
