const express = require('express');
const authController = require('../controllers/auth.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
// Protected update route
router.put('/:id', authMiddleware, authController.update);
router.patch('/:id/password', authMiddleware, authController.passwordChange);

module.exports = router;
