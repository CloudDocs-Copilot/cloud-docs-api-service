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
 * 2. Almacena el token en una cookie segura (psifi_csrf_token)
 * 3. El cliente debe enviar el mismo token en el header x-csrf-token
 * 4. El middleware valida que ambos tokens coincidan
 *
 * Seguridad:
 * - sameSite=none en producción (permite cross-origins)
 * - sameSite=lax en desarrollo
 * - httpOnly=true (JavaScript no puede acceder)
 * - secure=true en producción (solo HTTPS)
 * - Token de 64 bytes
 */

// En producción el frontend (Vercel) y el backend (Render) son orígenes distintos (cross-site).
// Se requiere sameSite='none' + secure=true para que el navegador envíe la cookie.
// En desarrollo se usa 'lax' para no requerir HTTPS.
const isProduction = process.env.NODE_ENV === 'production';

// Función auxiliar para extraer user ID del JWT token
const extractUserIdFromJWT = (cookieHeader: string): string | null => {
  const tokenMatch = cookieHeader.match(/token=([^;]*)/);
  if (!tokenMatch) {
    return null;
  }

  try {
    // Token format: header.payload.signature
    const tokenParts = tokenMatch[1].split('.');
    if (tokenParts.length !== 3) {
      return null;
    }

    // Decode payload (base64url)
    const decodedPayload = Buffer.from(
      tokenParts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');

    const payload = JSON.parse(decodedPayload) as unknown;

    // Type guard: verify payload has id property
    if (payload && typeof payload === 'object' && 'id' in payload) {
      const id = (payload as Record<string, unknown>).id;
      if (typeof id === 'string') {
        return id;
      }
    }

    return null;
  } catch {
    // If JWT parsing fails, return null and fall back to IP-based identifier
    return null;
  }
};

const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: 'psifi_csrf_token',
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
  // Extract user ID from JWT token in cookies to use as session identifier
  // This ensures CSRF tokens remain valid across the entire user session
  getSessionIdentifier: (req: Request): string => {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader && typeof cookieHeader === 'string') {
      const userId = extractUserIdFromJWT(cookieHeader);
      if (userId) {
        return userId;
      }
    }
    // Fall back to IP address if no valid JWT token found
    return req.ip || 'anonymous';
  }
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

  return csrfProtection.doubleCsrfProtection(req, res, next);
};

// Exportar la función para generar tokens CSRF
export const generateCsrfToken = csrfProtection.generateCsrfToken;
