import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import { validateOrganizationMembership } from '../middlewares/organization.middleware';
import * as documentController from '../controllers/document.controller';
import { upload } from '../middlewares/upload.middleware';
import { uploadRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authMiddleware);

/**
 * @route   POST /api/documents/upload
 * @desc    Sube un nuevo documento
 * @access  Authenticated users (organization members)
 */
// CSRF protection is applied globally in app.ts
router.post(
  '/upload',
  uploadRateLimiter,
  upload.single('file'),
  /*validateOrganizationMembership('body'),*/
  documentController.upload
);

/**
 * @route   GET /api/documents
 * @desc    Lista todos los documentos del usuario
 * @access  Authenticated users
 */
router.get('/', documentController.list);

/**
 * @route   GET /api/documents/recent/:organizationId
 * @desc    Obtiene documentos recientes del usuario en una organización
 * @access  Authenticated users (organization members)
 */
router.get('/recent/:organizationId', validateOrganizationMembership('params'), documentController.getRecent);

/**
 * @route   GET /api/documents/:id
 * @desc    Obtiene un documento por ID
 * @access  Document owner or shared users
 */
router.get('/:id', documentController.getById);

/**
 * @route   GET /api/documents/download/:id
 * @desc    Descarga un documento
 * @access  Document owner or shared users
 */
router.get('/download/:id', documentController.download);

/**
 * @route   POST /api/documents/:id/share
 * @desc    Comparte un documento con otros usuarios
 * @access  Document owner
 */
router.post('/:id/share', documentController.share);

/**
 * @route   POST /api/documents/:id/move
 * @desc    Mueve un documento a otra carpeta
 * @access  Document owner
 */
router.post('/:id/move', documentController.move);

/**
 * @route   POST /api/documents/:id/copy
 * @desc    Copia un documento a otra carpeta
 * @access  Document owner
 */
router.post('/:id/copy', documentController.copy);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Elimina un documento
 * @access  Document owner
 */
router.delete('/:id', documentController.remove);



export default router;
