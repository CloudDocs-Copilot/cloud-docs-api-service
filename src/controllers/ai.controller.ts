import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ragService } from '../services/ai/rag.service';
import { documentProcessor } from '../services/document-processor.service';
import { textExtractionService } from '../services/ai/text-extraction.service';
import { EMBEDDING_DIMENSIONS } from '../models/types/ai.types';
import DocumentModel from '../models/document.model';
import HttpError from '../models/error.model';
import { hasActiveMembership } from '../services/membership.service';

/**
 * Controlador para hacer una pregunta usando RAG (Retrieval-Augmented Generation)
 *
 * Busca información relevante en todos los documentos procesados de la organización
 * y genera una respuesta utilizando el contexto encontrado.
 *
 * @route POST /api/ai/ask
 * @access Authenticated users (organization members)
 */
export async function askQuestion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { question, organizationId } = req.body;

    // Validar campos requeridos
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return next(new HttpError(400, 'Question is required and must be a non-empty string'));
    }

    if (!organizationId) {
      return next(new HttpError(400, 'Organization ID is required'));
    }

    // Validar que el usuario pertenece a la organización
    const isActiveMember = await hasActiveMembership(req.user!.id, organizationId);
    if (!isActiveMember) {
      return next(new HttpError(403, 'Access denied: You are not a member of this organization'));
    }

    // Ejecutar búsqueda RAG
    const response = await ragService.answerQuestion(question);

    // Validar que los documentos fuente pertenecen a la organización
    // (por seguridad, no retornar información de otras organizaciones)
    if (response.sources.length > 0) {
      const documents = await DocumentModel.find({
        _id: { $in: response.sources.map(id => new mongoose.Types.ObjectId(id)) },
        organization: new mongoose.Types.ObjectId(organizationId)
      }).lean();

      // Filtrar solo los documentos que pertenecen a la organización
      const validSourceIds = documents.map(doc => doc._id.toString());
      response.sources = response.sources.filter(id => validSourceIds.includes(id));

      // Si hay chunks, también filtrarlos
      if (response.chunks) {
        response.chunks = response.chunks.filter(chunk =>
          validSourceIds.includes(chunk.documentId)
        );
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para hacer una pregunta sobre un documento específico
 *
 * Busca información relevante solo dentro del documento especificado
 * y genera una respuesta basada en su contenido.
 *
 * @route POST /api/ai/documents/:documentId/ask
 * @access Document owner/shared users (organization members)
 */
export async function askQuestionInDocument(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;
    const { question } = req.body;

    // Validar campos requeridos
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return next(new HttpError(400, 'Question is required and must be a non-empty string'));
    }

    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return next(new HttpError(400, 'Invalid document ID'));
    }

    // Buscar el documento y validar permisos
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Validar acceso al documento
    const userId = req.user!.id;
    const isOwner = String(document.uploadedBy) === String(userId);
    const isShared = document.sharedWith?.some(id => String(id) === String(userId));

    // Si el documento está en una organización, validar membresía
    if (document.organization) {
      const isActiveMember = await hasActiveMembership(userId, String(document.organization));
      if (!isActiveMember && !isOwner && !isShared) {
        return next(new HttpError(403, 'Access denied: You do not have access to this document'));
      }
    } else {
      // Para documentos personales, solo el owner o usuarios con los que se comparte
      if (!isOwner && !isShared) {
        return next(new HttpError(403, 'Access denied: You do not have access to this document'));
      }
    }

    // Ejecutar búsqueda RAG en el documento específico
    const response = await ragService.answerQuestionInDocument(question, documentId);

    res.json({
      success: true,
      data: response
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para procesar un documento (chunking + embeddings)
 *
 * Procesa el contenido del documento dividiéndolo en chunks y generando
 * embeddings vectoriales para búsqueda semántica.
 *
 * @route POST /api/ai/documents/:documentId/process
 * @access Document owner or organization admin
 */
export async function processDocument(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;
    const { text } = req.body;

    // Validar campos requeridos
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return next(new HttpError(400, 'Invalid document ID'));
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return next(
        new HttpError(
          400,
          'Text content is required and must be a non-empty string. Extract text from the document first.'
        )
      );
    }

    // Buscar el documento y validar permisos
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Validar que el usuario es el propietario del documento
    const userId = req.user!.id;
    const isOwner = String(document.uploadedBy) === String(userId);

    if (!isOwner) {
      // Si no es owner, verificar si es admin de la organización
      if (document.organization) {
        const isActiveMember = await hasActiveMembership(userId, String(document.organization));
        if (!isActiveMember) {
          return next(
            new HttpError(403, 'Access denied: Only document owner can process documents')
          );
        }
        // Aquí podrías agregar validación de rol admin si fuera necesario
        // const membership = await getMembership(userId, String(document.organization));
        // if (membership.role !== 'admin' && membership.role !== 'owner') {...}
      } else {
        return next(new HttpError(403, 'Access denied: Only document owner can process documents'));
      }
    }

    // Procesar el documento
    const result = await documentProcessor.processDocument(documentId, text);

    console.log(`[ai-controller] Document ${documentId} processed: ${result.chunksCreated} chunks`);

    res.json({
      success: true,
      message: 'Document processed successfully',
      data: { ...result, dimensions: (result as any).dimensions ?? EMBEDDING_DIMENSIONS }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para eliminar los chunks procesados de un documento
 *
 * Elimina todos los chunks e embeddings asociados al documento.
 * Útil para reprocesar o limpiar documentos obsoletos.
 *
 * @route DELETE /api/ai/documents/:documentId/chunks
 * @access Document owner or organization admin
 */
export async function deleteDocumentChunks(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;

    // Validar documento ID
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return next(new HttpError(400, 'Invalid document ID'));
    }

    // Buscar el documento y validar permisos
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Validar que el usuario es el propietario del documento
    const userId = req.user!.id;
    const isOwner = String(document.uploadedBy) === String(userId);

    if (!isOwner) {
      if (document.organization) {
        const isActiveMember = await hasActiveMembership(userId, String(document.organization));
        if (!isActiveMember) {
          return next(
            new HttpError(403, 'Access denied: Only document owner can delete document chunks')
          );
        }
      } else {
        return next(
          new HttpError(403, 'Access denied: Only document owner can delete document chunks')
        );
      }
    }

    // Eliminar chunks
    const deletedCount = await documentProcessor.deleteDocumentChunks(documentId);

    console.log(`[ai-controller] Deleted ${deletedCount} chunks from document ${documentId}`);

    res.json({
      success: true,
      message: 'Document chunks deleted successfully',
      data: { deletedCount }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para extraer texto de un documento
 *
 * Extrae el texto de documentos en formatos soportados (PDF, DOCX, DOC, TXT, MD).
 * El texto extraído puede luego ser usado para procesar el documento con embeddings.
 *
 * @route GET /api/ai/documents/:documentId/extract-text
 * @access Document owner/shared users (organization members)
 */
export async function extractDocumentText(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;

    // Validar documento ID
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      return next(new HttpError(400, 'Invalid document ID'));
    }

    // Buscar el documento
    const document = await DocumentModel.findById(documentId);

    if (!document) {
      return next(new HttpError(404, 'Document not found'));
    }

    // Validar acceso al documento
    const userId = req.user!.id;
    const isOwner = String(document.uploadedBy) === String(userId);
    const isShared = document.sharedWith?.some(id => String(id) === String(userId));

    // Si el documento está en una organización, validar membresía
    if (document.organization) {
      const isActiveMember = await hasActiveMembership(userId, String(document.organization));
      if (!isActiveMember && !isOwner && !isShared) {
        return next(new HttpError(403, 'Access denied: You do not have access to this document'));
      }
    } else {
      // Para documentos personales, solo el owner o usuarios con los que se comparte
      if (!isOwner && !isShared) {
        return next(new HttpError(403, 'Access denied: You do not have access to this document'));
      }
    }

    // Verificar que el tipo MIME es soportado
    if (!textExtractionService.isSupportedMimeType(document.mimeType)) {
      return next(
        new HttpError(
          400,
          `Unsupported file type: ${document.mimeType}. Supported types: ${textExtractionService.getSupportedMimeTypes().join(', ')}`
        )
      );
    }

    // Extraer texto del documento
    const result = await textExtractionService.extractText(document.path, document.mimeType);

    console.log(
      `[ai-controller] Extracted text from document ${documentId}: ${result.charCount} chars`
    );

    res.json({
      success: true,
      message: 'Text extracted successfully',
      data: result
    });
  } catch (err) {
    next(err);
  }
}
