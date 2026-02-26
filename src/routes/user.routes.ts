import express from 'express';
import authenticateToken from '../middlewares/auth.middleware';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/role.middleware';
import * as userController from '../controllers/user.controller';
import { upload } from '../middlewares/upload.middleware';

const router = express.Router();

// CSRF protection is applied globally in app.ts
router.get('/', authenticateToken, requireAdmin, userController.list);

// Buscar usuarios por email: /api/users/search?email=xxx
router.get('/search', authenticateToken, userController.search);

// Acciones sobre el propio usuario
router.delete('/me', authenticateToken, (req, res, next) => {
  req.params.id = 'me';
  void userController.deleteSelf(req, res, next);
});

// Perfil del usuario autenticado (lectura y actualización)
router.get('/profile', authenticateToken, userController.getProfile);
router.put('/profile', authenticateToken, (req, res, next) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.id) req.params.id = authReq.user.id;
  void userController.update(req, res, next);
});

router.patch('/:id/activate', authenticateToken, requireAdmin, userController.activate);
router.patch('/:id/deactivate', authenticateToken, requireAdmin, userController.deactivate);
router.put('/:id', authenticateToken, userController.update);
router.patch('/:id/password', authenticateToken, userController.changePassword);

// Subida de avatar: soporta multipart/form-data (archivo) o json (url)
// Opción amigable: /profile/avatar (usa el ID del token)
router.patch('/profile/avatar', authenticateToken, upload.single('avatar'), (req, res, next) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.id) req.params.id = authReq.user.id;
  void userController.updateAvatar(req, res, next);
});

// Opción directa por ID (mantenida por compatibilidad)
router.patch(
  '/:id/avatar',
  authenticateToken,
  upload.single('avatar'),
  userController.updateAvatar
);

router.delete('/:id', authenticateToken, requireAdmin, userController.remove);

export default router;
