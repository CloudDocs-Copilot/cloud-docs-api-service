import mongoose from 'mongoose';
import DeletionAuditModel, { DeletionAction, DeletionStatus, IDeletionAudit } from '../../../src/models/deletion-audit.model';

describe('DeletionAudit Model', (): void => {
  describe('Schema Validation', (): void => {
    it('should create audit record with all required fields', (): void => {
      // Arrange
      const documentId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const auditData = {
        document: documentId,
        documentSnapshot: {
          filename: 'test-document.pdf',
          originalname: 'test-document.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          path: '/uploads/test-document.pdf'
        },
        performedBy: userId,
        action: DeletionAction.SOFT_DELETE,
        status: DeletionStatus.COMPLETED
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.document).toEqual(documentId);
      expect(audit.documentSnapshot.filename).toBe('test-document.pdf');
      expect(audit.documentSnapshot.originalname).toBe('test-document.pdf');
      expect(audit.documentSnapshot.size).toBe(1024);
      expect(audit.documentSnapshot.mimeType).toBe('application/pdf');
      expect(audit.documentSnapshot.path).toBe('/uploads/test-document.pdf');
      expect(audit.performedBy).toEqual(userId);
      expect(audit.action).toBe(DeletionAction.SOFT_DELETE);
      expect(audit.status).toBe(DeletionStatus.COMPLETED);
    });

    it('should set default status to PENDING when not provided', (): void => {
      // Arrange
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.status).toBe(DeletionStatus.PENDING);
    });

    it('should validate required document field', (): void => {
      // Arrange
      const invalidData = {
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE
      };

      // Act
      const audit = new DeletionAuditModel(invalidData);
      const validationError = audit.validateSync();

      // Assert
      expect(validationError).toBeDefined();
      expect(validationError?.errors.document).toBeDefined();
    });

    it('should validate required performedBy field', (): void => {
      // Arrange
      const invalidData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        action: DeletionAction.SOFT_DELETE
      };

      // Act
      const audit = new DeletionAuditModel(invalidData);
      const validationError = audit.validateSync();

      // Assert
      expect(validationError).toBeDefined();
      expect(validationError?.errors.performedBy).toBeDefined();
    });

    it('should validate required action field', (): void => {
      // Arrange
      const invalidData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId()
      };

      // Act
      const audit = new DeletionAuditModel(invalidData);
      const validationError = audit.validateSync();

      // Assert
      expect(validationError).toBeDefined();
      expect(validationError?.errors.action).toBeDefined();
    });

    it('should reject invalid action values', (): void => {
      // Arrange
      const invalidData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: 'invalid_action' as unknown as string
      };

      // Act
      const audit = new DeletionAuditModel(invalidData);
      const validationError = audit.validateSync();

      // Assert
      expect(validationError).toBeDefined();
      expect(validationError?.errors.action).toBeDefined();
    });

    it('should reject invalid status values', (): void => {
      // Arrange
      const invalidData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE,
        status: 'invalid_status' as unknown as string
      };

      // Act
      const audit = new DeletionAuditModel(invalidData);
      const validationError = audit.validateSync();

      // Assert
      expect(validationError).toBeDefined();
      expect(validationError?.errors.status).toBeDefined();
    });
  });

  describe('Optional Fields', (): void => {
    it('should accept optional organization field', (): void => {
      // Arrange
      const orgId = new mongoose.Types.ObjectId();
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        organization: orgId,
        action: DeletionAction.AUTO_DELETE,
        status: DeletionStatus.COMPLETED
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.organization).toEqual(orgId);
    });

    it('should accept optional reason field', (): void => {
      // Arrange
      const reason = 'User requested permanent deletion for compliance';
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.PERMANENT_DELETE,
        status: DeletionStatus.COMPLETED,
        reason
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.reason).toBe(reason);
    });

    it('should accept ipAddress when provided', (): void => {
      // Arrange
      const ipAddress = '192.168.1.100';
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE,
        status: DeletionStatus.COMPLETED,
        ipAddress
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.ipAddress).toBe(ipAddress);
    });

    it('should accept userAgent when provided', (): void => {
      // Arrange
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE,
        status: DeletionStatus.COMPLETED,
        userAgent
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.userAgent).toBe(userAgent);
    });

    it('should accept overwrite method and passes for secure deletion', (): void => {
      // Arrange
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'sensitive.pdf',
          originalname: 'sensitive.pdf',
          size: 2048,
          mimeType: 'application/pdf',
          path: '/uploads/sensitive.pdf'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SECURE_OVERWRITE,
        status: DeletionStatus.COMPLETED,
        overwriteMethod: 'DoD 5220.22-M' as const,
        overwritePasses: 7
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.overwriteMethod).toBe('DoD 5220.22-M');
      expect(audit.overwritePasses).toBe(7);
    });

    it('should accept timestamp fields when provided', (): void => {
      // Arrange
      const confirmedAt = new Date('2026-02-25T10:00:00Z');
      const completedAt = new Date('2026-02-25T10:05:00Z');
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.PERMANENT_DELETE,
        status: DeletionStatus.COMPLETED,
        confirmedAt,
        completedAt
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.confirmedAt).toEqual(confirmedAt);
      expect(audit.completedAt).toEqual(completedAt);
    });

    it('should accept errorMessage when deletion fails', (): void => {
      // Arrange
      const errorMessage = 'File system error: permission denied';
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.PERMANENT_DELETE,
        status: DeletionStatus.FAILED,
        errorMessage
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert
      expect(audit.errorMessage).toBe(errorMessage);
    });
  });

  describe('DeletionAction Enum', (): void => {
    it('should have correct enum values for all deletion actions', (): void => {
      // Assert
      expect(DeletionAction.SOFT_DELETE).toBe('move_to_trash');
      expect(DeletionAction.RESTORE).toBe('restore_from_trash');
      expect(DeletionAction.PERMANENT_DELETE).toBe('permanent_delete');
      expect(DeletionAction.SECURE_OVERWRITE).toBe('secure_overwrite');
      expect(DeletionAction.AUTO_DELETE).toBe('auto_delete');
    });
  });

  describe('DeletionStatus Enum', (): void => {
    it('should have correct enum values for all deletion statuses', (): void => {
      // Assert
      expect(DeletionStatus.PENDING).toBe('pending');
      expect(DeletionStatus.CONFIRMED).toBe('confirmed');
      expect(DeletionStatus.COMPLETED).toBe('completed');
      expect(DeletionStatus.FAILED).toBe('failed');
      expect(DeletionStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('Schema Configuration', (): void => {
    it('should have timestamps enabled', (): void => {
      // Arrange
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE,
        status: DeletionStatus.COMPLETED
      };

      // Act
      const audit = new DeletionAuditModel(auditData);

      // Assert - verify timestamp fields exist in the schema paths
      expect(DeletionAuditModel.schema.path('createdAt')).toBeDefined();
      expect(DeletionAuditModel.schema.path('updatedAt')).toBeDefined();
    });

    it('should transform JSON output correctly', (): void => {
      // Arrange
      const auditData = {
        document: new mongoose.Types.ObjectId(),
        documentSnapshot: {
          filename: 'test.pdf',
          originalname: 'test.pdf',
          size: 100,
          mimeType: 'application/pdf',
          path: '/test'
        },
        performedBy: new mongoose.Types.ObjectId(),
        action: DeletionAction.SOFT_DELETE,
        status: DeletionStatus.COMPLETED
      };

      // Act
      const audit = new DeletionAuditModel(auditData);
      const json = audit.toJSON();

      // Assert
      expect(json._id).toBeUndefined(); // Should be removed by transform
      expect(json.__v).toBeUndefined(); // Version key should be removed
      expect(json.id).toBeDefined(); // Virtual id should be present
    });
  });
});
