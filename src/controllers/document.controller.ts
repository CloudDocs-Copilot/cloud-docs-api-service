import { Response, NextFunction } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as documentService from '../services/document.service';
import HttpError from '../models/error.model';
import { validateDownloadPath } from '../utils/path-sanitizer';

/**
 * Controlador para subir un nuevo documento
 */
export async function upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      return next(new HttpError(400, 'File is required'));
    }
    

    // folderId es opcional - si no se proporciona, se usa el rootFolder del usuario
    const doc = await documentService.uploadDocument({
      file: req.file,
      userId: req.user!.id,
      folderId: req.body.folderId || undefined
    });
    
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      document: doc
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para listar documentos del usuario
 */
export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const docs = await documentService.listDocuments(req.user!.id);
    
    res.json({
      success: true,
      count: docs.length,
      documents: docs
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para obtener documentos recientes del usuario
 */
export async function getRecent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const organizationId = req.params.organizationId;
    
    if (!organizationId) {
      return next(new HttpError(400, 'Organization ID is required'));
    }

    if (typeof organizationId !== 'string' || !mongoose.Types.ObjectId.isValid(organizationId)) {
      return next(new HttpError(400, 'Invalid Organization ID'));
    }
    
    const docs = await documentService.getUserRecentDocuments({
      userId: req.user!.id,
      limit
    });
    
    res.json({
      success: true,
      count: docs.length,
      documents: docs
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para obtener un documento por ID
 */
export async function getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.findDocumentById(req.params.id);
    
    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }
    
    // Verificar acceso (owner o compartido)
    const hasAccess = 
      doc.uploadedBy.toString() === req.user!.id ||
      doc.sharedWith?.some((userId: any) => userId.toString() === req.user!.id);
    
    if (!hasAccess) {
      return next(new HttpError(403, 'Access denied to this document'));
    }
    
    res.json({
      success: true,
      document: doc
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para compartir documento con otros usuarios
 */
export async function share(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return next(new HttpError(400, 'User IDs array is required'));
    }
    
    const doc = await documentService.shareDocument({
      id: req.params.id,
      userId: req.user!.id,
      userIds
    });
    
    res.json({
      success: true,
      message: 'Document shared successfully',
      document: doc
    });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
    next(err);
  }
}

/**
 * Controlador para mover un documento a otra carpeta
 */
export async function move(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { targetFolderId } = req.body;
    
    if (!targetFolderId) {
      return next(new HttpError(400, 'Target folder ID is required'));
    }
    
    const doc = await documentService.moveDocument({
      documentId: req.params.id,
      userId: req.user!.id,
      targetFolderId
    });
    
    res.json({
      success: true,
      message: 'Document moved successfully',
      document: doc
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para copiar un documento a otra carpeta
 */
export async function copy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { targetFolderId } = req.body;
    
    if (!targetFolderId) {
      return next(new HttpError(400, 'Target folder ID is required'));
    }
    
    const newDoc = await documentService.copyDocument({
      documentId: req.params.id,
      userId: req.user!.id,
      targetFolderId
    });
    
    res.status(201).json({
      success: true,
      message: 'Document copied successfully',
      document: newDoc
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para descargar un documento
 */
export async function download(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.findDocumentById(req.params.id);
    
    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }
    
    // Verificar acceso (owner o compartido)
    const hasAccess = 
      doc.uploadedBy.toString() === req.user!.id ||
      doc.sharedWith?.some((userId: any) => userId.toString() === req.user!.id);
    
    if (!hasAccess) {
      return next(new HttpError(403, 'Access denied to this document'));
    }
    
    // Validar y sanitizar el path para prevenir Path Traversal
    const uploadsBase = path.join(process.cwd(), 'uploads');
    const storageBase = path.join(process.cwd(), 'storage');
    
    let filePath: string;
    try {
      // Intentar primero en uploads
      filePath = await validateDownloadPath(doc.filename || '', uploadsBase);
    } catch (error) {
      // Si no está en uploads, intentar en storage
      try {
        filePath = await validateDownloadPath(doc.filename || '', storageBase);
      } catch (error2) {
        return next(new HttpError(404, 'File not found'));
      }
    }
    
    res.download(filePath, doc.originalname || 'download');
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para eliminar un documento
 */
export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await documentService.deleteDocument({
      id: req.params.id,
      userId: req.user!.id
    });
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
    next(err);
  }
}

export default { upload, list, getRecent, getById, share, move, copy, download, remove };
