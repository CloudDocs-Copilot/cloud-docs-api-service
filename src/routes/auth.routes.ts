import express from 'express';
import * as authController from '../controllers/auth.controller';
import { authRateLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

// Aplica limitación de tasa estricta a endpoints de autenticación para prevenir ataques de fuerza bruta
// CSRF protection is applied globally in app.ts
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authRateLimiter, authController.refresh);
router.post('/logout', authController.logout);

// Confirmación de cuenta por email
router.get('/confirm/:token', authRateLimiter, authController.confirmAccount);

export default router;
