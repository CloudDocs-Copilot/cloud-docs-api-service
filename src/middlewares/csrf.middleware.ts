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
 * 2. Almacena el token en una cookie segura (psifi.x-csrf-token)
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

const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: 'psifi.x-csrf-token',  // Nombre correcto que usa csrf-csrf
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
  // ✅ FIX: Use actual user ID instead of JWT token prefix to avoid invalidation on token refresh
  getSessionIdentifier: (req: Request): string => {
    const cookieHeader = req.headers.cookie;
    
    // Try to extract user ID from JWT token (most stable)
    if (cookieHeader && typeof cookieHeader === 'string') {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      for (const cookie of cookies) {
        if (cookie.startsWith('token=')) {
          const jwtToken = cookie.substring(6);
          
          try {
            // Decode JWT without verification to extract user ID
            // This is safe because:
            // 1. JWT signature is verified by other middlewares
            // 2. We only use the ID for CSRF session binding
            // 3. If JWT is invalid/expired, authentication will fail elsewhere
            const parts = jwtToken.split('.');
            if (parts.length === 3) {
              // Decode payload (second part of JWT)
              const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8')) as { id?: string };
              const userId = decodedPayload.id;
              
              if (userId && typeof userId === 'string') {
                if (isProduction && req.method !== 'GET') {
                  console.error('[CSRF-SESSION-ID]', {
                    method: req.method,
                    path: req.path,
                    sessionIdType: 'user-id-based',
                    userId: userId.substring(0, 12) + '...',
                    message: '✅ Using stable user ID instead of JWT token prefix'
                  });
                }
                
                // Return user ID as session identifier (stable across token refreshes)
                return userId;
              }
            }
          } catch (error) {
            // JWT decode failed - fallback to anonymous
            if (isProduction && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
              console.error('[CSRF-SESSION-ID-ERROR]', {
                path: req.path,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Failed to decode JWT payload'
              });
            }
          }
        }
      }
    }
    
    // Fallback: return "anonymous" (for unauthenticated requests)
    return 'anonymous';
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

/**
 * Middleware para limpiar cookies CSRF antiguos/duplicados
 * Problema: Tenemos psifi_csrf_token (antiguo) y psifi.x-csrf-token (nuevo)
 * Chrome añade __Host-psifi.x-csrf-token
 * Solución: Eliminar los cookies viejos para evitar conflictos
 * 
 * OPTIMIZACIÓN: Solo se ejecuta si detecta cookies viejos (no en cada request)
 */
export const cleanupOldCsrfCookies = (req: Request, res: Response, next: NextFunction): void => {
  // Cookies antiguos a eliminar
  const oldCookieNames = ['psifi_csrf_token', '__Host-psifi.x-csrf-token'];
  
  // Solo limpiar si detectamos cookies antiguos - evita overhead innecesario
  let hasOldCookies = false;
  for (const cookieName of oldCookieNames) {
    if (req.cookies[cookieName]) {
      hasOldCookies = true;
      
      // Establecer cookie con max-age=0 para eliminarlo
      res.clearCookie(cookieName, {
        path: '/',
        domain: isProduction ? '.onrender.com' : undefined,
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax'
      });
    }
  }
  
  if (isProduction && hasOldCookies && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
    console.error('[CSRF-CLEANUP-OLD-COOKIES]', {
      path: req.path,
      cookiesRemoved: oldCookieNames.filter(name => req.cookies[name])
    });
  }
  
  next();
};

// Exportar el middleware de protección CSRF
export const csrfProtectionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (CSRF_EXCLUDED_ROUTES.includes(req.path)) {
    return next();
  }

  // Log incoming CSRF requests in production
  if (isProduction && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
    const hasXCsrfToken = !!req.headers['x-csrf-token'];
    const cookieStr = req.headers.cookie || '';
    const hasCsrfCookie = cookieStr.includes('psifi.x-csrf-token=');
    const hasAuthToken = cookieStr.includes('token=');
    
    console.error('[CSRF-REQUEST-CHECK]', {
      method: req.method,
      path: req.path,
      hasXCsrfTokenHeader: hasXCsrfToken,
      xCsrfTokenLength: (req.headers['x-csrf-token'] as string)?.length || 0,
      hasCsrfCookie,
      hasAuthToken,
      cookies: cookieStr.split(';').map((c) => c.trim().split('=')[0])
    });
  }

  return csrfProtection.doubleCsrfProtection(req, res, next);
};

// Exportar la función para generar tokens CSRF
export const generateCsrfToken = csrfProtection.generateCsrfToken;
