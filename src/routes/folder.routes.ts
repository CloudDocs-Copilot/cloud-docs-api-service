import express from 'express';
import * as folderController from '../controllers/folder.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

router.post('/', authMiddleware, folderController.create);
router.get('/', authMiddleware, folderController.list);
router.delete('/:id', authMiddleware, folderController.remove);
router.patch('/:id', authMiddleware, folderController.rename);

export default router;
