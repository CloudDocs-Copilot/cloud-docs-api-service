import express from 'express';
import * as folderController from '../controllers/folder.controller';
import authMiddleware from '../middlewares/auth.middleware';
import { validateOrganizationMembership } from '../middlewares/organization.middleware';
import { createResourceRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authMiddleware);

/**
 * @route   POST /api/folders
 * @desc    Crea una nueva carpeta
 * @access  Authenticated users (organization members)
 */
// CSRF protection is applied globally in app.ts
router.post(
  '/',
  createResourceRateLimiter,
  validateOrganizationMembership('body'),
  folderController.create
);

/**
 * @route   GET /api/folders
 * @desc    Lista carpetas del usuario (DEPRECATED - usar /tree)
 * @access  Authenticated users
 */
router.get('/', folderController.list);

/**
 * @route   GET /api/folders/tree
 * @desc    Obtiene el árbol de carpetas del usuario
 * @access  Authenticated users
 */
router.get('/tree', folderController.getUserTree);

/**
 * @route   GET /api/folders/:id/contents
 * @desc    Obtiene el contenido de una carpeta específica
 * @access  Folder owner or shared users
 */
router.get('/:id/contents', folderController.getContents);

/**
 * @route   POST /api/folders/:id/share
 * @desc    Comparte una carpeta con otro usuario
 * @access  Folder owner
 */
router.post('/:id/share', folderController.share);

/**
 * @route   PATCH /api/folders/:id/move
 * @desc    Mueve una carpeta a otra ubicación
 * @access  Folder owner/editor
 */
router.patch('/:id/move', folderController.move);

/**
 * @route   PATCH /api/folders/:id
 * @desc    Renombra una carpeta
 * @access  Folder owner
 */
router.patch('/:id', folderController.rename);

/**
 * @route   DELETE /api/folders/:id
 * @desc    Elimina una carpeta
 * @access  Folder owner
 */
router.delete('/:id', folderController.remove);

export default router;
