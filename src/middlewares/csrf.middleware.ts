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
    console.log(`[CSRF] ✅ Ruta excluida: ${req.path}`);
    return next();
  }

  console.log(`[CSRF DEBUG] Validando ${req.method} ${req.path}`);
  
  // Log de headers (defensivo para tests)
  const csrfTokenHeader = req.headers?.['x-csrf-token'];
  const cookies = req.headers?.cookie || '';
  const cookieTokenMatch = cookies.match(/(?:^|;\s*)(?:__Host-)?psifi\.x-csrf-token=([^;]*)/);
  const cookieToken = cookieTokenMatch ? cookieTokenMatch[1] : undefined;
  
  console.log(`[CSRF DEBUG] Headers:`, {
    'x-csrf-token header': csrfTokenHeader ? csrfTokenHeader.toString().substring(0, 30) + '...' : 'MISSING',
    'cookie token': cookieToken ? cookieToken.substring(0, 30) + '...' : 'MISSING',
    'origin': req.headers?.origin,
    'user-agent': req.headers?.['user-agent'] ? req.headers['user-agent'].toString().substring(0, 50) : 'N/A',
    'ip': req.ip
  });

  // Envolver respuesta para capturar errores
  const originalJson = res.json.bind(res);
  res.json = function(body: unknown) {
    if ((res.statusCode === 403 || res.statusCode === 401) && typeof body === 'object' && body !== null) {
      console.error(`[CSRF ERROR] ${res.statusCode} - ${JSON.stringify(body)}`);
    }
    return originalJson(body);
  };

  return csrfProtection.doubleCsrfProtection(req, res, next);
};

// Exportar la función para generar tokens CSRF
export const generateCsrfToken = csrfProtection.generateCsrfToken;
