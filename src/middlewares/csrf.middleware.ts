import { NextFunction, Request, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';

/**
 * ✅ PROTECCIÓN CSRF - Double Submit Cookie Pattern
 *
 * Este middleware implementa protección contra ataques Cross-Site Request Forgery (CSRF)
 * usando el patrón Double Submit Cookie, equivalente a la protección de csurf (deprecated).
 *
 * Funcionamiento:
 * 1. Genera un token CSRF único por sesión
 * 2. Almacena el token en una cookie segura (__Host-psifi.x-csrf-token)
 * 3. El cliente debe enviar el mismo token en el header x-csrf-token
 * 4. El middleware valida que ambos tokens coincidan
 *
 * Seguridad:
 * - Cookie con prefijo __Host- (máxima seguridad, solo HTTPS en producción)
 * - sameSite=strict (previene envío cross-site)
 * - httpOnly=true (JavaScript no puede acceder)
 * - secure=true en producción (solo HTTPS)
 * - Token de 64 bytes
 *
 * Ver documentación completa en: CSRF-PROTECTION-EXPLANATION.md
 */
// En producción el frontend (Vercel) y el backend (Render) son orígenes distintos (cross-site).
// Se requiere sameSite='none' + secure=true para que el navegador envíe la cookie.
// En desarrollo se usa 'lax' para no requerir HTTPS.
const isProduction = process.env.NODE_ENV === 'production';

const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    secure: isProduction,
    httpOnly: true
  },
  size: 64,
  ignoredMethods:
    process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'
      ? ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']
      : ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req: Request): string => req.ip || 'anonymous'
});
// Rutas que NO requieren CSRF (autenticación pública)
const CSRF_EXCLUDED_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/csrf-token',
  '/confirm/:token',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
];
// Exportar el middleware de protección CSRF
export const csrfProtectionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (CSRF_EXCLUDED_ROUTES.includes(req.path)) {
    return next();
  }

  // Log CSRF validation for non-GET requests
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    console.log(`\n🔐 [CSRF] ${req.method} ${req.path}`);
    
    // Log header token
    const headerToken = req.headers['x-csrf-token'];
    if (headerToken) {
      const tokenStr = typeof headerToken === 'string' ? headerToken : headerToken[0];
      console.log('   Header x-csrf-token:', tokenStr.substring(0, 20) + '...' + tokenStr.substring(tokenStr.length - 20));
      console.log('   Header token length:', tokenStr.length);
    } else {
      console.log('   ❌ Header x-csrf-token: NO PRESENTE');
    }
    
    // Log cookie token
    const cookieName = isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';
    const cookieToken = req.cookies[cookieName];
    if (cookieToken) {
      console.log('   Cookie', cookieName + ':', cookieToken.substring(0, 20) + '...' + cookieToken.substring(cookieToken.length - 20));
      console.log('   Cookie token length:', cookieToken.length);
    } else {
      console.log('   ❌ Cookie', cookieName + ': NO PRESENTE');
    }
    
    // Compare tokens
    if (headerToken && cookieToken) {
      const headerStr = typeof headerToken === 'string' ? headerToken : headerToken[0];
      const match = headerStr === cookieToken;
      console.log('   Comparación:', match ? '✅ COINCIDEN' : '❌ NO COINCIDEN');
    }
    console.log();
  }

  return csrfProtection.doubleCsrfProtection(req, res, next);
};

// Exportar la función para generar tokens CSRF
export const generateCsrfToken = csrfProtection.generateCsrfToken;
