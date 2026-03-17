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
    // Parse Cookie header properly: "cookie1=value1; cookie2=value2; ..."
    // Split by semicolon and find the "token=" cookie
    const cookies = cookieHeader.split(';').map(c => c.trim());
    let jwtToken: string | null = null;
    
    for (const cookie of cookies) {
      if (cookie.startsWith('token=')) {
        jwtToken = cookie.substring(6); // Remove "token=" prefix
        break;
      }
    }
    
    if (!jwtToken) {
      if (isProduction) {
        console.error('[CSRF-JWT-EXTRACTION-DEBUG] No "token=" cookie found', {
          cookieCount: cookies.length,
          cookieNames: cookies.map(c => c.split('=')[0])
        });
      }
      return null;
    }

    // Decode URL-encoded token if necessary
    jwtToken = decodeURIComponent(jwtToken);
    
    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-DEBUG]', {
        jwtTokenLength: jwtToken.length,
        jwtTokenStart: jwtToken.substring(0, 50),
        hasThreeParts: jwtToken.split('.').length === 3
      });
    }
    
    // Token format: header.payload.signature (JWT must have exactly 3 parts)
    const tokenParts = jwtToken.split('.');
    if (tokenParts.length !== 3) {
      if (isProduction) {
        console.error('[CSRF-JWT-EXTRACTION-DEBUG]', {
          error: `Invalid JWT format - expected 3 parts, got ${tokenParts.length}`,
          parts: tokenParts.length,
          jwtTokenLength: jwtToken.length,
          // Check if this looks like a CSRF token instead
          mightBeCsrfToken: jwtToken.length > 100 && !jwtToken.includes('.')
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
      console.error('[CSRF-JWT-EXTRACTION-DEBUG] Decoded payload:', decodedPayload.substring(0, 150));
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
        payloadKeys: parsedPayload && typeof parsedPayload === 'object' ? Object.keys(parsedPayload as Record<string, unknown>) : 'not-object',
        idType: typeof (parsedPayload as Record<string, unknown>).id
      });
    }

    return null;
  } catch (error) {
    // If JWT parsing fails, return null and fall back to IP-based identifier
    if (isProduction) {
      console.error('[CSRF-JWT-EXTRACTION-ERROR]', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack?.substring(0, 200) : 'No stack',
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
  // IMPORTANT: Session identifier must be STABLE even if IP changes (load balancer)
  getSessionIdentifier: (req: Request): string => {
    const cookieHeader = req.headers.cookie;
    let sessionId = 'anonymous';
    let extractedUserId: string | null = null;
    
    if (cookieHeader && typeof cookieHeader === 'string') {
      extractedUserId = extractUserIdFromJWT(cookieHeader);
      if (extractedUserId) {
        sessionId = extractedUserId;
      } else {
        // IMPORTANT: Use User-Agent fingerprint instead of IP
        // IP changes with load balancer, breaking CSRF validation
        // User-Agent is stable within same browser session
        const userAgent = req.headers['user-agent'] || 'unknown';
        const userAgentHash = userAgent
          .split('')
          .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
          .toString(36);
        sessionId = `ua-${userAgentHash}`;
      }
    } else {
      // Fallback: use User-Agent fingerprint
      const userAgent = req.headers['user-agent'] || 'unknown';
      const userAgentHash = userAgent
        .split('')
        .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
        .toString(36);
      sessionId = `ua-${userAgentHash}`;
    }

    if (isProduction && req.method !== 'GET') {
      console.error('[CSRF-SESSION-ID]', {
        method: req.method,
        path: req.path,
        sessionId,
        sessionIdType: extractedUserId ? 'user-id' : 'user-agent-hash',
        extractedUserId: extractedUserId ? 'found' : 'NOT_FOUND',
        hasCookieHeader: !!cookieHeader,
        userAgent: req.headers['user-agent']?.substring(0, 80) || 'MISSING',
        ipAddress: req.ip
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
