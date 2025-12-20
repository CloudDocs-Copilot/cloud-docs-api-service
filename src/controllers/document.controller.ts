import { Response, NextFunction } from 'express';
import path from 'path';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as documentService from '../services/document.service';
import HttpError from '../models/error.model';
import { validateDownloadPath } from '../utils/path-sanitizer';

/**
 * Controlador para compartir documento con otros usuarios
 */
export async function share(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.shareDocument({
      id: req.params.id,
      userId: req.user!.id,
      userIds: req.body.userIds
    });
    res.json({ message: 'Document shared successfully', doc });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
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
    res.json({ message: 'Document deleted successfully' });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
    next(err);
  }
}

/**
 * Controlador para subir un nuevo documento
 */
export async function upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.uploadDocument({
      file: req.file!,
      userId: req.user!.id,
      folderId: req.body.folderId
    });
    res.status(201).json(doc);
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
    res.json(docs);
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
    if (!doc) return next(new HttpError(404, 'Document not found'));
    
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

export default { share, remove, upload, list, download };
