import { Response, NextFunction } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import mammoth from 'mammoth';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as documentService from '../services/document.service';
import HttpError from '../models/error.model';
import { validateDownloadPath } from '../utils/path-sanitizer';
import { hasActiveMembership } from '../services/membership.service';

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
 * Controlador para reemplazar (sobrescribir) el archivo de un documento existente
 */
export async function replaceFile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      return next(new HttpError(400, 'File is required'));
    }

    const doc = await documentService.replaceDocumentFile({
      documentId: req.params.id,
      userId: req.user!.id,
      file: req.file
    });

    res.json({
      success: true,
      message: 'Document file replaced successfully',
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
 * Controlador para listar documentos compartidos al usuario (por otros usuarios)
 */
export async function listSharedToMe(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const docs = await documentService.listSharedDocumentsToUser(req.user!.id);

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
export async function getRecent(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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
    const doc = await documentService.findDocumentById(req.params.id as string);

    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Verificar acceso:
    // - Si pertenece a una organización: cualquier miembro ACTIVO de esa organización puede acceder.
    // - Si es personal (sin organización): solo owner o sharedWith.
    let hasAccess = false;

    if (doc.organization) {
      hasAccess = await hasActiveMembership(req.user!.id, doc.organization.toString());
    } else {
      hasAccess =
        doc.uploadedBy.toString() === req.user!.id ||
        doc.sharedWith?.some((userId: any) => userId.toString() === req.user!.id);
    }

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
      id: req.params.id as string,
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
      documentId: req.params.id as string,
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
      documentId: req.params.id as string,
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
    const doc = await documentService.findDocumentById(req.params.id as string);

    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Verificar acceso:
    // - Si pertenece a una organización: cualquier miembro ACTIVO de esa organización puede acceder.
    // - Si es personal (sin organización): solo owner o sharedWith.
    let hasAccess = false;

    if (doc.organization) {
      hasAccess = await hasActiveMembership(req.user!.id, doc.organization.toString());
    } else {
      hasAccess =
        doc.uploadedBy.toString() === req.user!.id ||
        doc.sharedWith?.some((userId: any) => userId.toString() === req.user!.id);
    }

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
      // Si no está en uploads, intentar en storage usando doc.path (ruta real dentro de storage)
      try {
        const relativePath = doc.path?.startsWith('/') ? doc.path.substring(1) : doc.path || '';
        filePath = await validateDownloadPath(relativePath, storageBase);
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
 * Controlador para previsualizar un documento (servir inline)
 * Similar a download pero sirve el archivo inline en lugar de forzar descarga
 * Convierte documentos Word a HTML automáticamente
 */
export async function preview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.findDocumentById(req.params.id as string);

    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Verificar acceso:
    // - Si pertenece a una organización: cualquier miembro ACTIVO de esa organización puede acceder.
    // - Si es personal (sin organización): solo owner o sharedWith.
    let hasAccess = false;

    if (doc.organization) {
      hasAccess = await hasActiveMembership(req.user!.id, doc.organization.toString());
    } else {
      hasAccess =
        doc.uploadedBy.toString() === req.user!.id ||
        doc.sharedWith?.some((userId: any) => userId.toString() === req.user!.id);
    }

    if (!hasAccess) {
      return next(new HttpError(403, 'Access denied to this document'));
    }

    console.log('[preview] Document info:', {
      id: doc._id,
      filename: doc.filename,
      originalname: doc.originalname,
      path: doc.path,
      mimeType: doc.mimeType
    });

    const uploadsBase = path.join(process.cwd(), 'uploads');
    const storageBase = path.join(process.cwd(), 'storage');
    const relativePath = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;

    console.log('[preview] Uploads base:', uploadsBase);
    console.log('[preview] Storage base:', storageBase);
    console.log('[preview] Relative path:', relativePath);

    // Intentar validar el path
    let fullPath: string | null = null;

    // Intentar primero en uploads
    try {
      fullPath = await validateDownloadPath(relativePath, uploadsBase);
      console.log('[preview] Found in uploads:', fullPath);
    } catch (error) {
      // Si falla, intentar en storage
      try {
        fullPath = await validateDownloadPath(relativePath, storageBase);
        console.log('[preview] Found in storage:', fullPath);
      } catch (error2) {
        // Si falla, intentar con /obs adicional (bug conocido de duplicación)
        const alternativePath = path.join('obs', relativePath);
        console.log('[preview] Trying alternative path in uploads:', alternativePath);

        try {
          fullPath = await validateDownloadPath(alternativePath, uploadsBase);
          console.log('[preview] Alternative path worked in uploads:', fullPath);
        } catch (error3) {
          console.error('[preview] All paths failed');
          return next(new HttpError(404, 'File not found'));
        }
      }
    }

    if (!fullPath) {
      return next(new HttpError(404, 'File not found'));
    }

    // Detectar si es un documento Word y convertirlo a HTML
    const isWordDocument =
      doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      doc.mimeType === 'application/msword';

    if (isWordDocument) {
      console.log('[preview] Converting Word document to HTML');

      try {
        const result = await mammoth.convertToHtml({ path: fullPath });
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.originalname || 'Document Preview'}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .document-container {
      background: white;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #333;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    p {
      margin-bottom: 12px;
      color: #444;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    table, th, td {
      border: 1px solid #ddd;
    }
    th, td {
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: #f8f9fa;
    }
  </style>
</head>
<body>
  <div class="document-container">
    ${result.value}
  </div>
</body>
</html>
        `;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      } catch (conversionError) {
        console.error('[preview] Error converting Word document:', conversionError);
        // Fallback: servir el archivo original
      }
    }

    // Para otros tipos de archivos, servir normalmente
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalname || 'preview'}"`);

    // Enviar archivo
    res.sendFile(fullPath);
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
      id: req.params.id as string,
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

/**
 * Controlador para obtener el estado de procesamiento AI de un documento
 * RFE-AI-002: Auto-procesamiento
 */
export async function getAIStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await documentService.findDocumentById(req.params.id);

    if (!doc) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Verificar que el usuario tiene acceso al documento
    if (String(doc.uploadedBy) !== req.user!.id && !doc.isSharedWith(req.user!.id)) {
      // Si el documento pertenece a una organización, verificar membership
      if (doc.organization) {
        const hasMembership = await hasActiveMembership(
          req.user!.id,
          doc.organization.toString()
        );
        if (!hasMembership) {
          return next(new HttpError(403, 'Access denied'));
        }
      } else {
        return next(new HttpError(403, 'Access denied'));
      }
    }

    res.json({
      success: true,
      data: {
        status: doc.aiProcessingStatus || 'none',
        category: doc.aiCategory || null,
        confidence: doc.aiConfidence || null,
        tags: doc.aiTags || [],
        summary: doc.aiSummary || null,
        keyPoints: doc.aiKeyPoints || [],
        processedAt: doc.aiProcessedAt || null,
        error: doc.aiError || null
      }
    });
  } catch (err) {
    next(err);
  }
}

export default {
  upload,
  replaceFile,
  list,
  listSharedToMe,
  getRecent,
  getById,
  share,
  move,
  copy,
  download,
  preview,
  remove,
  getAIStatus
};
