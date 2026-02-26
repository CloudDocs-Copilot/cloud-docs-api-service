import { Response, NextFunction } from 'express';
import { deletionService, SecureDeleteOptions } from '../services/deletion.service';
import HttpError from '../models/error.model';
import { AuthRequest } from '../middlewares/auth.middleware';

/**
 * Controlador de Eliminación Segura de Documentos
 */

/**
 * Mueve un documento a la papelera (soft delete)
 * POST /api/documents/:id/trash
 */
export const moveToTrash = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const userId = req.user.id;
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;

    const context = {
      userId,
      organizationId,
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent') : undefined,
      reason
    };

    const document = await deletionService.moveToTrash(id, context);

    res.status(200).json({
      success: true,
      message: 'Document moved to trash successfully',
      data: document
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Restaura un documento de la papelera
 * POST /api/documents/:id/restore
 */
export const restoreFromTrash = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const userId = req.user.id;
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;

    const context = {
      userId,
      organizationId,
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent') : undefined,
      reason
    };

    const document = await deletionService.restoreFromTrash(id, context);

    res.status(200).json({
      success: true,
      message: 'Document restored successfully',
      data: document
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Elimina permanentemente un documento con sobrescritura segura
 * DELETE /api/documents/:id/permanent
 */
export const permanentDelete = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    
    // Validar método de eliminación segura
    const validMethods = ['simple', 'DoD 5220.22-M', 'Gutmann'] as const;
    type SecureDeleteMethod = typeof validMethods[number];
    const methodValue = typeof body.secureDeleteMethod === 'string' ? body.secureDeleteMethod : 'simple';
    const secureDeleteMethod: SecureDeleteMethod = validMethods.includes(methodValue as SecureDeleteMethod) 
      ? (methodValue as SecureDeleteMethod) 
      : 'simple';
    
    const overwritePasses = typeof body.overwritePasses === 'number' ? body.overwritePasses : undefined;
    const userId = req.user.id;
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;

    const context = {
      userId,
      organizationId,
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent') : undefined,
      reason
    };

    const options: SecureDeleteOptions = {
      method: secureDeleteMethod,
      passes: overwritePasses
    };

    await deletionService.permanentDelete(id, context, options);

    res.status(200).json({
      success: true,
      message: 'Document permanently deleted'
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Obtiene documentos en la papelera
 * GET /api/documents/trash
 */
export const getTrash = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const userId = req.user.id;
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;

    // Support optional pagination via query params
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    if (page && limit) {
      const skip = (page - 1) * limit;
      const query: Record<string, unknown> = { uploadedBy: userId, isDeleted: true };
      if (organizationId && typeof organizationId === 'string') query.organization = organizationId;

      const total = await (await import('../models/document.model')).default.countDocuments(query);
      const documents = await (await import('../models/document.model')).default
        .find(query)
        .populate('folder', 'name type')
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit);

      res.status(200).json({
        success: true,
        count: documents.length,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalItems: total,
          totalPages: Math.ceil(total / limit)
        },
        data: documents
      });
      return;
    }

    const documents = await deletionService.getTrash(userId, organizationId || undefined);

    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Vacía toda la papelera del usuario
 * DELETE /api/documents/trash
 */
export const emptyTrash = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const body = req.body as Record<string, unknown>;
    
    // Validar método de eliminación segura
    const validMethods = ['simple', 'DoD 5220.22-M', 'Gutmann'] as const;
    type SecureDeleteMethod = typeof validMethods[number];
    const methodValue = typeof body.secureDeleteMethod === 'string' ? body.secureDeleteMethod : 'simple';
    const secureDeleteMethod: SecureDeleteMethod = validMethods.includes(methodValue as SecureDeleteMethod) 
      ? (methodValue as SecureDeleteMethod) 
      : 'simple';
    
    const overwritePasses = typeof body.overwritePasses === 'number' ? body.overwritePasses : undefined;
    const userId = req.user.id;
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;

    const context = {
      userId,
      organizationId,
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: typeof req.get('user-agent') === 'string' ? req.get('user-agent') : undefined,
      reason: 'Empty trash'
    };

    const options: SecureDeleteOptions = {
      method: secureDeleteMethod,
      passes: overwritePasses
    };

    const deletedCount = await deletionService.emptyTrash(context, options);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${deletedCount} documents`,
      data: { deletedCount }
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Obtiene el historial de auditoría de eliminaciones de un documento
 * GET /api/documents/:id/deletion-history
 */
export const getDocumentDeletionHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const history = await deletionService.getDocumentDeletionHistory(id);

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * Obtiene el historial de auditoría de eliminaciones de una organización
 * GET /api/organizations/:id/deletion-audit
 * Solo accesible por admins/owners
 */
export const getOrganizationDeletionAudit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.activeOrganization ? String(req.activeOrganization) : undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!organizationId || typeof organizationId !== 'string') {
      throw new HttpError(400, 'Organization context required');
    }

    const audit = await deletionService.getOrganizationDeletionAudit(organizationId, limit);

    res.status(200).json({
      success: true,
      count: audit.length,
      data: audit
    });
  } catch (error: unknown) {
    next(error);
  }
};
