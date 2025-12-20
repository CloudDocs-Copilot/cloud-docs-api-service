import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import * as documentController from '../controllers/document.controller';
import { upload } from '../middlewares/upload.middleware';
import { uploadRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

// Aplica limitación de tasa específica al endpoint de subida para prevenir abuso
router.post('/upload', authMiddleware, uploadRateLimiter, upload.single('file'), documentController.upload);

// Otras operaciones de documentos usan el limitador de tasa general aplicado globalmente
router.post('/:id/share', authMiddleware, documentController.share);
router.delete('/:id', authMiddleware, documentController.remove);
router.get('/', authMiddleware, documentController.list);
router.get('/download/:id', authMiddleware, documentController.download);

export default router;
