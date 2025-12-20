import express from 'express';
import * as folderController from '../controllers/folder.controller';
import authMiddleware from '../middlewares/auth.middleware';
import { createResourceRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

// Aplica limitación de tasa para creación de recursos para prevenir creación excesiva de carpetas
router.post('/', authMiddleware, createResourceRateLimiter, folderController.create);

// Otras operaciones de carpetas usan el limitador de tasa general aplicado globalmente
router.get('/', authMiddleware, folderController.list);
router.delete('/:id', authMiddleware, folderController.remove);
router.patch('/:id', authMiddleware, folderController.rename);

export default router;
