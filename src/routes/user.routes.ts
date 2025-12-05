import express from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/role.middleware';
import * as userController from '../controllers/user.controller';

const router = express.Router();

router.get('/', authMiddleware, requireAdmin, userController.list);
router.patch('/:id/activate', authMiddleware, requireAdmin, userController.activate);
router.patch('/:id/deactivate', authMiddleware, requireAdmin, userController.deactivate);
router.put('/:id', authMiddleware, userController.update);
router.patch('/:id/password', authMiddleware, userController.changePassword);
router.delete('/:id', authMiddleware, requireAdmin, userController.remove);

export default router;
