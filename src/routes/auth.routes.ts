import express from 'express';
import * as authController from '../controllers/auth.controller';
import { authRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

// Aplica limitación de tasa estricta a endpoints de autenticación para prevenir ataques de fuerza bruta
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);

export default router;
