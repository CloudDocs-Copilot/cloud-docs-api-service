import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import * as commentController from '../controllers/comment.controller';

const router = express.Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authMiddleware);

/**
 * @route   GET /api/comments/documents/:documentId
 * @desc    Lista comentarios de un documento
 * @access  Authenticated users with read access to the document
 */
router.get('/documents/:documentId', commentController.listByDocument);

/**
 * @route   POST /api/comments/documents/:documentId
 * @desc    Crea un comentario para un documento
 * @access  Authenticated users with read access to the document
 */
router.post('/documents/:documentId', commentController.create);

/**
 * @route   PATCH /api/comments/:id
 * @desc    Actualiza un comentario (solo autor)
 * @access  Authenticated users (comment owner)
 */
router.patch('/:id', commentController.update);

export default router;
