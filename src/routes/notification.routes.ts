import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import * as notificationController from '../controllers/notification.controller';

const router = express.Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authMiddleware);

/**
 * @route   GET /api/notifications
 * @desc    Lista notificaciones del usuario
 * @access  Authenticated users
 */
router.get('/', notificationController.list);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Marca una notificación como leída
 * @access  Authenticated users
 */
router.patch('/:id/read', notificationController.markRead);

/**
 * @route   POST /api/notifications/read-all
 * @desc    Marca todas las notificaciones como leídas
 * @access  Authenticated users
 */
router.post('/read-all', notificationController.markAllRead);

export default router;
