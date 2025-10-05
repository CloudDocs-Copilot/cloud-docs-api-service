const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware.js');
const { requireAdmin } = require('../middlewares/role.middleware.js');
const userController = require('../controllers/user.controller.js');

const router = express.Router();

router.get('/', authMiddleware, requireAdmin, userController.list);
router.patch('/:id/activate', authMiddleware, requireAdmin, userController.activate);
router.patch('/:id/deactivate', authMiddleware, requireAdmin, userController.deactivate);
router.put('/:id', authMiddleware, userController.update);
router.patch('/:id/password', authMiddleware, userController.changePassword);
router.delete('/:id', authMiddleware, requireAdmin, userController.remove);

module.exports = router;
