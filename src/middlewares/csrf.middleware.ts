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

// Función auxiliar para extraer user ID del JWT token
const extractUserIdFromJWT = (cookieHeader: string): string | null => {
  try {
    // Extract token from Cookie header: "token=eyJ...;other=value"
    const tokenMatch = cookieHeader.match(/token=([^;]+)/);
    if (!tokenMatch) {
      if (isProduction) {
        console.error('[CSRF-JWT-EXTRACTION-DEBUG] No token= match found');
      }
      return null;
    }

    // Decode URL-encoded token if necessary
    let jwtToken = decodeURIComponent(tokenMatch[1]);
    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-DEBUG]', {
        jwtTokenLength: jwtToken.length,
        jwtTokenStart: jwtToken.substring(0, 50)
      });
    }
    
    // Token format: header.payload.signature
    const tokenParts = jwtToken.split('.');
    if (tokenParts.length !== 3) {
      if (isProduction) {
        console.error('[CSRF-JWT-EXTRACTION-DEBUG]', {
          error: 'Invalid JWT format - not 3 parts',
          parts: tokenParts.length
        });
      }
      return null;
    }

    // Decode payload (base64url)
    // Add padding if necessary
    let payload = tokenParts[1];
    const padding = 4 - (payload.length % 4);
    if (padding !== 4) {
      payload += '='.repeat(padding);
    }
    
    const decodedPayload = Buffer.from(
      payload
        .replace(/-/g, '+')
        .replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');

    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-DEBUG] Decoded payload:', decodedPayload.substring(0, 100));
    }

    const parsedPayload = JSON.parse(decodedPayload) as unknown;

    // Type guard: verify payload has id property
    if (parsedPayload && typeof parsedPayload === 'object' && 'id' in parsedPayload) {
      const id = (parsedPayload as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) {
        if (isProduction) {
          console.error('[CSRF-JWT-EXTRACTION-SUCCESS]', { extractedId: id });
        }
        return id;
      }
    }

    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-DEBUG]', {
        error: 'Payload missing id or id is not string',
        hasIdProperty: 'id' in (parsedPayload as Record<string, unknown>),
        idType: typeof (parsedPayload as Record<string, unknown>).id
      });
    }

    return null;
  } catch (error) {
    // If JWT parsing fails, return null and fall back to IP-based identifier
    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-ERROR]', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack',
        cookieHeaderLength: cookieHeader?.length || 0
      });
    }
    return null;
  }
};

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
  getSessionIdentifier: (req: Request): string => {
    const cookieHeader = req.headers.cookie;
    let sessionId = 'anonymous';
    let extractedUserId: string | null = null;
    
    if (cookieHeader && typeof cookieHeader === 'string') {
      extractedUserId = extractUserIdFromJWT(cookieHeader);
      if (extractedUserId) {
        sessionId = extractedUserId;
      } else {
        sessionId = req.ip || 'anonymous';
      }
    } else {
      sessionId = req.ip || 'anonymous';
    }

    if (isProduction && req.method !== 'GET') {
      console.error('[CSRF-SESSION-ID]', {
        method: req.method,
        path: req.path,
        sessionId,
        extractedUserId: extractedUserId ? 'found' : 'NOT_FOUND',
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader?.length || 0,
        ipAddress: req.ip,
        hasJwt: cookieHeader?.includes('token=') || false
      });
    }
    
    return sessionId;
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
 */
export const cleanupOldCsrfCookies = (req: Request, res: Response, next: NextFunction): void => {
  // Cookies antiguos a eliminar
  const oldCookieNames = ['psifi_csrf_token', '__Host-psifi.x-csrf-token'];
  
  // Si el navegador tiene cookies antiguos, eliminarlos
  oldCookieNames.forEach((cookieName) => {
    if (req.cookies[cookieName]) {
      // Establecer cookie con max-age=0 para eliminarlo
      res.clearCookie(cookieName, {
        path: '/',
        domain: isProduction ? '.onrender.com' : undefined,
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax'
      });
      
      if (isProduction) {
        console.error('[CSRF-CLEANUP-OLD-COOKIES]', {
          removedCookie: cookieName,
          path: req.path
        });
      }
    }
  });
  
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
