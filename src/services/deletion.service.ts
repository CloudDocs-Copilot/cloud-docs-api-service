import fs from 'fs/promises';
import crypto from 'crypto';
import DocumentModel, { IDocument } from '../models/document.model';
import DeletionAuditModel, { DeletionAction, DeletionStatus } from '../models/deletion-audit.model';
import HttpError from '../models/error.model';
import { Types } from 'mongoose';
import searchService from './search.service';
import notificationService from './notification.service';
import User from '../models/user.model';
import { emitToUser } from '../socket/socket';
/**
 * Configuración de retención de papelera (30 días por defecto - cumplimiento GDPR)
 */
const TRASH_RETENTION_DAYS = 30;

/**
 * Opciones para sobrescritura segura
 */
export interface SecureDeleteOptions {
  /** Método de sobrescritura */
  method?: 'simple' | 'DoD 5220.22-M' | 'Gutmann';
  /** Número de pasadas (sobrescribe el método predeterminado) */
  passes?: number;
}

/**
 * Información del usuario para auditoría
 */
export interface DeletionContext {
  userId: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

/**
 * Servicio de Eliminación Segura de Documentos
 * Implementa soft delete, papelera temporal, eliminación segura y auditoría GDPR
 */
class DeletionService {
  /**
   * Mueve un documento a la papelera (soft delete)
   * El documento permanece en la papelera por 30 días antes de eliminarse permanentemente
   */
  async moveToTrash(documentId: string, context: DeletionContext): Promise<IDocument> {
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      throw new HttpError(404, 'Document not found');
    }

    // Verificar permisos
    if (!document.isOwnedBy(context.userId)) {
      throw new HttpError(403, 'You do not have permission to delete this document');
    }

    // Verificar que no esté ya eliminado
    if (document.isDeleted) {
      throw new HttpError(400, 'Document is already in trash');
    }

    const now = new Date();
    const scheduledDeletion = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Actualizar documento (soft delete)
    document.isDeleted = true;
    document.deletedAt = now;
    document.deletedBy = new Types.ObjectId(context.userId);
    // Guardar la razón de eliminación para auditoría y respuestas API
    document.deletionReason = context.reason ?? null;
    document.scheduledDeletionDate = scheduledDeletion;

    await document.save();

    // Crear registro de auditoría
    const auditData: any = {
      document: document._id,
      documentId: document._id,
      documentSnapshot: {
        filename: document.filename,
        originalname: document.originalname,
        size: document.size,
        mimeType: document.mimeType,
        path: document.path,
        organization: document.organization,
      },
      performedBy: context.userId,
      organization: context.organizationId || document.organization,
      action: DeletionAction.SOFT_DELETE,
      status: DeletionStatus.COMPLETED,
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      completedAt: now,
    };

    await DeletionAuditModel.create(auditData);

    // Remover de Elasticsearch
    try {
      await searchService.removeDocumentFromIndex(documentId);
    } catch (error) {
      console.error('Failed to remove document from search index:', error);
      // No fallar la operación si Elasticsearch falla
    }

    try {

      const orgId = (document.organization?.toString?.() || context.organizationId || '').toString();
      if (orgId) {
        const actor = await User.findById(context.userId).select('name email').lean();
        const actorName = (actor as any)?.name || (actor as any)?.email || 'Alguien';

        await notificationService.notifyMembersOfOrganization({
          organizationId: orgId,
          actorUserId: context.userId,
          type: 'DOC_DELETED',
          entityKind: 'document',
          entityId: document._id.toString(),
          message: `${actorName} movió "${document.originalname || 'un documento'}" a la papelera`,
          metadata: {
            originalname: document.originalname,
            filename: document.filename,
            folderId: document.folder?.toString?.(),
            reason: context.reason,
            action: 'trash',
            actorName,
          },
          emitter: (recipientUserId: string, payload: any) => {
            emitToUser(recipientUserId, 'notification:new', payload);
          },
        });
      }
    } catch (e: any) {
      console.error('Failed to create notification (DOC_DELETED on trash):', e.message);
    }
    
    return document;
  }

  /**
   * Recupera un documento de la papelera
   */
  async restoreFromTrash(documentId: string, context: DeletionContext): Promise<IDocument> {
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      throw new HttpError(404, 'Document not found');
    }

    // Verificar permisos
    if (!document.isOwnedBy(context.userId)) {
      throw new HttpError(403, 'You do not have permission to restore this document');
    }

    // Verificar que esté eliminado
    if (!document.isDeleted) {
      throw new HttpError(400, 'Document is not in trash');
    }

    // Restaurar documento
    document.isDeleted = false;
    document.deletedAt = undefined;
    document.deletedBy = undefined;
    document.deletionReason = undefined;
    document.scheduledDeletionDate = undefined;

    await document.save();

    // Crear registro de auditoría
    const auditData: any = {
      document: document._id,
      documentId: document._id,
      documentSnapshot: {
        filename: document.filename,
        originalname: document.originalname,
        size: document.size,
        mimeType: document.mimeType,
        path: document.path,
        organization: document.organization,
      },
      performedBy: context.userId,
      organization: context.organizationId || document.organization,
      action: DeletionAction.RESTORE,
      status: DeletionStatus.COMPLETED,
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      completedAt: new Date(),
    };

    await DeletionAuditModel.create(auditData);

    // Re-indexar en Elasticsearch
    try {
      await searchService.indexDocument(document);
    } catch (error) {
      console.error('Failed to re-index document:', error);
      // No fallar la operación si Elasticsearch falla
    }

    return document;
  }

  /**
   * Elimina permanentemente un documento con sobrescritura segura
   * Solo puede ser llamado por el propietario o automáticamente después de 30 días
   */
  async permanentDelete(
    documentId: string,
    context: DeletionContext,
    options: SecureDeleteOptions = {}
  ): Promise<void> {
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      throw new HttpError(404, 'Document not found');
    }

    // Verificar permisos
    if (!document.isOwnedBy(context.userId)) {
      throw new HttpError(403, 'You do not have permission to permanently delete this document');
    }

    // Debe estar en papelera
    if (!document.isDeleted) {
      throw new HttpError(400, 'Document must be in trash before permanent deletion');
    }

    const auditEntry = await DeletionAuditModel.create({
      document: document._id,
      documentId: document._id,
      documentSnapshot: {
        filename: document.filename,
        originalname: document.originalname,
        size: document.size,
        mimeType: document.mimeType,
        path: document.path,
        organization: document.organization,
      },
      performedBy: context.userId,
      organization: context.organizationId || document.organization,
      action: DeletionAction.PERMANENT_DELETE,
      status: DeletionStatus.PENDING,
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    try {
      // Sobrescritura segura del archivo físico
      await this.secureOverwriteFile(document.path, options);

      // Actualizar auditoría con detalles de sobrescritura
      auditEntry.overwriteMethod = options.method || 'simple';
      auditEntry.overwritePasses = this.getPassesForMethod(options.method || 'simple', options.passes);
      auditEntry.status = DeletionStatus.COMPLETED;
      auditEntry.completedAt = new Date();
      await auditEntry.save();

      // Eliminar documento de la base de datos
      await DocumentModel.findByIdAndDelete(documentId);

      // Asegurar que se eliminó de Elasticsearch
      try {
        await searchService.removeDocumentFromIndex(documentId);
      } catch (error) {
        console.error('Failed to remove from search index:', error);
      }

    } catch (error: any) {
      // Actualizar auditoría con el error
      auditEntry.status = DeletionStatus.FAILED;
      auditEntry.errorMessage = error.message;
      await auditEntry.save();

      throw new HttpError(500, `Failed to permanently delete document: ${error.message}`);
    }
  }

  /**
   * Sobrescribe de forma segura un archivo antes de eliminarlo
   * Implementa diferentes métodos de sobrescritura según el nivel de seguridad requerido
   */
  private async secureOverwriteFile(filePath: string, options: SecureDeleteOptions): Promise<void> {
    const method = options.method || 'simple';
    const passes = this.getPassesForMethod(method, options.passes);

    try {
      // Verificar que el archivo existe
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Ejecutar pasadas de sobrescritura
      for (let pass = 0; pass < passes; pass++) {
        const data = this.generateOverwriteData(pass, fileSize, method);
        await fs.writeFile(filePath, data);
        // Forzar sincronización en disco usando writeFileSync temporal
        const fsSync = require('fs');
        const fd = fsSync.openSync(filePath, 'r+');
        fsSync.fsyncSync(fd);
        fsSync.closeSync(fd);
      }

      // Eliminar el archivo
      await fs.unlink(filePath);

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // El archivo ya no existe, continuar
        console.warn(`File not found during secure deletion: ${filePath}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Genera datos para sobrescritura según el método seleccionado
   */
  private generateOverwriteData(pass: number, size: number, method: string): Buffer {
    switch (method) {
      case 'DoD 5220.22-M':
        // DoD 5220.22-M: 3 pasadas (0x00, 0xFF, random)
        if (pass === 0) return Buffer.alloc(size, 0x00);
        if (pass === 1) return Buffer.alloc(size, 0xFF);
        return crypto.randomBytes(size);

      case 'Gutmann':
        // Método Gutmann simplificado (35 pasadas con diferentes patrones)
        if (pass < 4) return crypto.randomBytes(size);
        if (pass >= 31) return crypto.randomBytes(size);
        // Pasadas intermedias con patrones específicos
        const patterns = [0x55, 0xAA, 0x92, 0x49, 0x24, 0x00, 0x11, 0x22, 0x33, 0x44,
                         0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
        return Buffer.alloc(size, patterns[pass % patterns.length]);

      case 'simple':
      default:
        // Sobrescritura simple: 1 pasada con datos aleatorios
        return crypto.randomBytes(size);
    }
  }

  /**
   * Obtiene el número de pasadas según el método
   */
  private getPassesForMethod(method: string, customPasses?: number): number {
    if (customPasses !== undefined) return customPasses;

    switch (method) {
      case 'DoD 5220.22-M':
        return 3;
      case 'Gutmann':
        return 35;
      case 'simple':
      default:
        return 1;
    }
  }

  /**
   * Obtiene documentos en la papelera del usuario
   */
  async getTrash(userId: string, organizationId?: string): Promise<IDocument[]> {
    const query: any = {
      uploadedBy: userId,
      isDeleted: true,
    };

    if (organizationId) {
      query.organization = organizationId;
    }

    return DocumentModel.find(query)
      .populate('folder', 'name type')
      .sort({ deletedAt: -1 });
  }

  /**
   * Vacía toda la papelera del usuario (eliminación permanente de todos los documentos)
   */
  async emptyTrash(context: DeletionContext, options: SecureDeleteOptions = {}): Promise<number> {
    const trashedDocuments = await this.getTrash(context.userId, context.organizationId);

    let deletedCount = 0;

    for (const document of trashedDocuments) {
      try {
        await this.permanentDelete(document.id, context, options);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete document ${document.id}:`, error);
        // Continuar con los demás documentos
      }
    }

    return deletedCount;
  }

  /**
   * Job programado: Elimina automáticamente documentos cuya fecha de eliminación ha expirado
   * Debe ejecutarse diariamente mediante un cron job
   */
  async autoDeleteExpiredDocuments(): Promise<number> {
    const now = new Date();

    // Buscar documentos que han excedido el período de retención
    const expiredDocuments = await DocumentModel.find({
      isDeleted: true,
      scheduledDeletionDate: { $lte: now },
    });

    let deletedCount = 0;

    for (const document of expiredDocuments) {
      try {
        const context: DeletionContext = {
          userId: document.deletedBy?.toString() || document.uploadedBy.toString(),
          organizationId: document.organization?.toString(),
          reason: 'Automatic deletion after retention period',
        };

        // Usar sobrescritura simple para eliminaciones automáticas (balance entre seguridad y rendimiento)
        await this.permanentDelete(document.id, context, { method: 'simple' });
        deletedCount++;

      } catch (error) {
        console.error(`Auto-delete failed for document ${document.id}:`, error);
        // Continuar con los demás documentos
      }
    }

    console.log(`Auto-deleted ${deletedCount} expired documents`);
    return deletedCount;
  }

  /**
   * Obtiene el historial de auditoría de eliminaciones para un documento
   */
  async getDocumentDeletionHistory(documentId: string): Promise<any[]> {
    return DeletionAuditModel.find({ document: documentId })
      .populate('performedBy', 'username email')
      .sort({ createdAt: -1 });
  }

  /**
   * Obtiene el historial de auditoría de eliminaciones de una organización
   */
  async getOrganizationDeletionAudit(organizationId: string, limit: number = 100): Promise<any[]> {
    return DeletionAuditModel.find({ organization: organizationId })
      .populate('performedBy', 'username email')
      .populate('document', 'filename originalname')
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

export const deletionService = new DeletionService();
