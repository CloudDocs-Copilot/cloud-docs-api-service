import express from 'express';
import authenticateToken from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/role.middleware';
import * as userController from '../controllers/user.controller';

const router = express.Router();

router.get('/', authenticateToken, requireAdmin, userController.list);
router.patch('/:id/activate', authenticateToken, requireAdmin, userController.activate);
router.patch('/:id/deactivate', authenticateToken, requireAdmin, userController.deactivate);
router.put('/:id', authenticateToken, userController.update);
router.patch('/:id/password', authenticateToken, userController.changePassword);
router.delete('/:id', authenticateToken, requireAdmin, userController.remove);

export default router;
