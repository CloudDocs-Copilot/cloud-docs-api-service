import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import openapiSpec from '../docs/openapi/openapi.json';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import userRoutes from './routes/user.routes';
import organizationRoutes from './routes/organization.routes';
import membershipRoutes from './routes/membership.routes';
import searchRoutes from './routes/search.routes';
import deletionRoutes from './routes/deletion.routes';
import commentRoutes from './routes/comment.routes';
import aiRoutes from './routes/ai.routes';
import aiConversationsRouter from './routes/aiConversations.routes';
import authMiddleware from './middlewares/auth.middleware';
import HttpError from './models/error.model';
import { errorHandler } from './middlewares/error.middleware';
import { generalRateLimiter } from './middlewares/rate-limit.middleware';
import { getCorsOptions } from './configurations/cors-config';
import { csrfProtectionMiddleware, generateCsrfToken, cleanupOldCsrfCookies } from './middlewares/csrf.middleware';
import notificationRoutes from './routes/notification.routes';

const app = express();

// Configurar proxy confiable para obtener IP real del cliente
app.set('trust proxy', 1);

// Seguridad: Headers HTTP con Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    },
    // X-Frame-Options - previene ataques de clickjacking
    frameguard: { action: 'deny' },
    // X-Content-Type-Options - previene el sniffing de tipos MIME
    noSniff: true,
    // Strict-Transport-Security - fuerza el uso de HTTPS
    hsts: {
      maxAge: 31536000, // 1 año en segundos
      includeSubDomains: true,
      preload: true
    },
    // X-XSS-Protection - habilita el filtro XSS del navegador
    xssFilter: true,
    // Referrer-Policy - controla la información del referrer
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // X-Permitted-Cross-Domain-Policies - restringe Adobe Flash y PDF
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    // Elimina el header X-Powered-By para ocultar Express
    hidePoweredBy: true
  })
);

// CORS: Configuración por entorno (ver ALLOWED_ORIGINS)
app.use(cors(getCorsOptions()));

// Parsear cookies y body JSON
// codeql[js/missing-token-validation] FALSE POSITIVE - See CSRF-PROTECTION-EXPLANATION.md
// CSRF protection is properly implemented using csrf-csrf middleware (next line)
// CodeQL doesn't recognize csrf-csrf package but it provides equivalent protection to csurf
app.use(cookieParser());

// ✅ Limpiar cookies CSRF antiguos/duplicados
// Elimina psifi_csrf_token (antiguo) y __Host-psifi.x-csrf-token para evitar conflictos
app.use(cleanupOldCsrfCookies);

app.use(express.json());

// ✅ PROTECCIÓN CSRF APLICADA GLOBALMENTE
// Excluye rutas de autenticación pública y el endpoint de generación de tokens CSRF
app.use((req, res, next) => {
  if (req.originalUrl.includes('register') || req.originalUrl.includes('/api/csrf-token')) {
    return next();
  }
  return csrfProtectionMiddleware(req, res, next);
});

// Protección contra inyección NoSQL
// Sanitiza los datos de entrada eliminando caracteres especiales de MongoDB ($, .)
// Previene ataques de inyección NoSQL en queries, actualizaciones y agregaciones
// Ejemplo: convierte { "$gt": "" } en { "gt": "" }
app.use(
  mongoSanitize({
    // Reemplaza caracteres prohibidos en lugar de eliminarlos
    replaceWith: '_'
    // Opción adicional: onSanitize se puede usar para logging cuando se detecta un intento de inyección
  })
);

// Rate limiting
app.use(generalRateLimiter);

// Helper function to safely truncate strings for debugging
const safeStringTruncate = (value: unknown, length: number = 20): string => {
  if (typeof value === 'string') {
    return value.substring(0, length) + '...';
  }
  return 'INVALID_TYPE';
};

// Endpoint: CSRF token
/**
 * GET /api/csrf-token
 * Genera un token CSRF y lo envía de dos formas:
 * 1. En una cookie HTTP-only: psifi.x-csrf-token (navegador la envía automáticamente)
 * 2. En el JSON response: { "token": "..." } (frontend lo usa en header x-csrf-token)
 *
 * El servidor valida que ambos valores coincidan en requests de cambio de estado (POST/PUT/PATCH/DELETE)
 */
app.get('/api/csrf-token', (req: Request, res: Response) => {
  const token = generateCsrfToken(req, res);
  
  console.error('[CSRF-TOKEN-DEBUG]', {
    timestamp: new Date().toISOString(),
    tokenValue: token,
    tokenLength: token.length,
    tokenType: typeof token,
    requestOrigin: req.headers.origin,
    nodeEnv: process.env.NODE_ENV,
    setCookieHeaders: res.getHeaders()['set-cookie']
  });
  
  res.json({
    token,
    message: 'Token CSRF generado. Se estableció automáticamente en cookie psifi.x-csrf-token. Envía este token en el header x-csrf-token.'
  });
});

// Debug endpoint - remove in production
app.get('/api/csrf-debug', (req: Request, res: Response) => {
  const token = generateCsrfToken(req, res);
  
  res.json({
    explanation: 'This endpoint shows debugging info about CSRF tokens. Remove in production.',
    tokenGenerated: {
      value: token.substring(0, 20) + '...' + token.substring(token.length - 20),
      length: token.length,
      type: typeof token,
      expectedLength: '~86 characters for size:64'
    },
    analysis: token.length > 100 ? '⚠️ Token is longer than expected!' : '✅ Token size looks correct',
    recommendations: [
      'Token should be exactly 64 bytes, which encodes to ~86 characters in base64url',
      `Actual length: ${token.length} characters`,
      token.length > 90 ? 'Token is larger than expected - check csrf-csrf library version' : 'Token length is expected'
    ]
  });
});
app.get('/api/test-csrf-debug', (req: Request, res: Response) => {
  // Type-safe extraction of cookie and header values with proper type guards
  const rawCookie = req.cookies['psifi.x-csrf-token'] as unknown;
  const csrfCookieValue = typeof rawCookie === 'string' ? rawCookie : null;
  
  const rawHeader = req.headers['x-csrf-token'] as unknown;
  const csrfHeaderValue = typeof rawHeader === 'string' ? rawHeader : null;

  res.json({
    cookieName_correctName: typeof csrfCookieValue === 'string' ? safeStringTruncate(csrfCookieValue) : 'MISSING',
    headerValue: typeof csrfHeaderValue === 'string' ? safeStringTruncate(csrfHeaderValue) : 'MISSING',
    allCookies: req.cookies
  });
});
// Servir archivos estáticos (imágenes de perfil, documentos públicos)
// Permite acceder a http://localhost:4000/uploads/archivo.jpg
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/deletion', deletionRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
// Mount conversations BEFORE the generic /api/ai router to prevent shadowing
app.use('/api/ai/conversations', authMiddleware, aiConversationsRouter);
app.use('/api/ai', aiRoutes);

// Documentación Swagger/OpenAPI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
app.get('/api/docs.json', (_req: Request, res: Response) => res.json(openapiSpec));

// Ruta raíz: redirige a Swagger UI
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/api/docs');
});

// Ruta /api
app.get('/api', (_req: Request, res: Response) => {
  res.json({ message: 'API running' });
});

// 404 handler
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new HttpError(404, 'Route not found'));
});

// Error handler
app.use(errorHandler);

export default app;
