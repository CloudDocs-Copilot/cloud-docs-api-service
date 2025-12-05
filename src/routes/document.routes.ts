import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import * as documentController from '../controllers/document.controller';
import { upload } from '../middlewares/upload.middleware';

const router = express.Router();

router.post('/:id/share', authMiddleware, documentController.share);
router.delete('/:id', authMiddleware, documentController.remove);
router.post('/upload', authMiddleware, upload.single('file'), documentController.upload);
router.get('/', authMiddleware, documentController.list);
router.get('/download/:id', authMiddleware, documentController.download);

export default router;
