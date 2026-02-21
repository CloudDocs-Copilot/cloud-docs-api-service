import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import * as aiController from '../controllers/ai.controller';
import { generalRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

/**
 * Todas las rutas AI requieren autenticación
 */
router.use(authMiddleware);

/**
 * @route   POST /api/ai/ask
 * @desc    Hace una pregunta usando RAG sobre todos los documentos de la organización
 * @access  Authenticated users (organization members)
 * @body    { question: string, organizationId: string }
 * @returns { success: true, data: { answer: string, sources: string[], chunks?: [...] } }
 */
router.post('/ask', generalRateLimiter, aiController.askQuestion);

/**
 * @route   POST /api/ai/documents/:documentId/ask
 * @desc    Hace una pregunta sobre un documento específico usando RAG
 * @access  Document owner/shared users (organization members)
 * @params  documentId - ID del documento
 * @body    { question: string }
 * @returns { success: true, data: { answer: string, sources: [documentId], chunks?: [...] } }
 */
router.post('/documents/:documentId/ask', generalRateLimiter, aiController.askQuestionInDocument);

/**
 * @route   GET /api/ai/documents/:documentId/extract-text
 * @desc    Extrae texto de un documento (PDF, DOCX, DOC, TXT, MD)
 * @access  Document owner/shared users (organization members)
 * @params  documentId - ID del documento
 * @returns { success: true, message: string, data: { text, charCount, wordCount, mimeType, metadata? } }
 */
router.get(
  '/documents/:documentId/extract-text',
  generalRateLimiter,
  aiController.extractDocumentText
);

/**
 * @route   POST /api/ai/documents/:documentId/process
 * @desc    Procesa un documento (chunking + embeddings) para búsqueda vectorial
 * @access  Document owner or organization admin
 * @params  documentId - ID del documento a procesar
 * @body    { text: string } - Contenido de texto del documento
 * @returns { success: true, message: string, data: { documentId, chunksCreated, dimensions } }
 */
router.post('/documents/:documentId/process', generalRateLimiter, aiController.processDocument);

/**
 * @route   DELETE /api/ai/documents/:documentId/chunks
 * @desc    Elimina los chunks procesados de un documento
 * @access  Document owner or organization admin
 * @params  documentId - ID del documento
 * @returns { success: true, message: string, data: { deletedCount: number } }
 */
router.delete(
  '/documents/:documentId/chunks',
  generalRateLimiter,
  aiController.deleteDocumentChunks
);

/**
 * @route   POST /api/ai/documents/:documentId/classify
 * @desc    Clasifica un documento en categorías predefinidas (manual)
 * @access  Document owner/shared users (organization members)
 * @params  documentId - ID del documento
 * @returns { success: true, message: string, data: { category, confidence, tags } }
 */
router.post(
  '/documents/:documentId/classify',
  generalRateLimiter,
  aiController.classifyDocument
);

/**
 * @route   POST /api/ai/documents/:documentId/summarize
 * @desc    Genera resumen y puntos clave del documento (manual)
 * @access  Document owner/shared users (organization members)
 * @params  documentId - ID del documento
 * @returns { success: true, message: string, data: { summary, keyPoints } }
 */
router.post(
  '/documents/:documentId/summarize',
  generalRateLimiter,
  aiController.summarizeDocument
);

export default router;
