import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Helper para manejar IPv6 correctamente
const ipKeyGenerator = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Normaliza direcciones IPv6 a un formato consistente
  return ip.replace(/^::ffff:/, '');
};

/**
 * Middleware de Rate Limiting
 *
 * Este middleware implementa una estrategia de limitación de tasa para proteger
 * la API contra abusos, ataques de denegación de servicio (DoS) y uso excesivo
 * de recursos.
 *
 * Funcionalidad:
 * - Limita el número de peticiones que un cliente puede hacer en un período de tiempo
 * - Identifica clientes por su dirección IP
 * - Responde con código HTTP 429 (Too Many Requests) cuando se excede el límite
 * - Incluye headers informativos sobre el límite y tiempo restante
 */

/**
 * Rate Limiter General
 *
 * Configuración estándar para endpoints públicos y generales.
 *
 * Configuración:
 * - windowMs: Ventana de tiempo en milisegundos (15 minutos)
 * - max: Número máximo de peticiones permitidas por ventana de tiempo (100 peticiones)
 * - standardHeaders: Incluye headers RateLimit-* estándar (RFC)
 * - legacyHeaders: Desactiva headers X-RateLimit-* antiguos
 * - message: Mensaje personalizado al exceder el límite
 * - skipSuccessfulRequests: Si true, solo cuenta peticiones fallidas
 * - skipFailedRequests: Si true, no cuenta peticiones fallidas
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit of 1000 requests per time window (increased for development)
  standardHeaders: true, // Returns rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disables legacy `X-RateLimit-*` headers
  // Skip rate limiting in test environment
  skip: (_req: Request) => process.env.NODE_ENV === 'test',
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 'Check the Retry-After header to know when you can try again.'
  },
  // Custom response function when limit is exceeded
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'You have exceeded the allowed request limit. Please wait before trying again.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Rate Limiter Estricto para Autenticación
 *
 * Configuración más restrictiva para endpoints sensibles como login,
 * registro y recuperación de contraseña.
 *
 * Configuración:
 * - windowMs: 15 minutos
 * - max: 5 intentos por ventana (más restrictivo para prevenir ataques de fuerza bruta)
 * - skipSuccessfulRequests: true - Solo cuenta intentos fallidos
 *
 * Uso recomendado:
 * - POST /auth/login
 * - POST /auth/register
 * - POST /auth/forgot-password
 * - POST /auth/reset-password
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 failed authentication attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Does not count successful requests (valid authentications)
  // Skip rate limiting in test environment
  skip: (_req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  message: {
    error: 'Too many failed authentication attempts.',
    retryAfter: 'Your account has been temporarily blocked for security.'
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Authentication Attempts',
      message:
        'Too many failed authentication attempts. Please wait 15 minutes before trying again.',
      retryAfter: res.getHeader('Retry-After'),
      blockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  }
});

/**
 * Rate Limiter para Creación de Recursos
 *
 * Límite moderado para operaciones de creación (POST) que consumen
 * más recursos del servidor.
 *
 * Configuración:
 * - windowMs: 1 hora
 * - max: 30 creaciones por hora
 *
 * Uso recomendado:
 * - POST /documents
 * - POST /folders
 * - POST /users (si aplica para usuarios no admin)
 */
export const createResourceRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Maximum 200 resources created per hour
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  message: {
    error: 'Resource creation limit exceeded.',
    retryAfter: 'You have reached the limit of resources you can create per hour.'
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Resource Creation Limit Exceeded',
      message: 'You have reached the resource creation limit per hour. Please try again later.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Rate Limiter para Subida de Archivos
 *
 * Límite específico para operaciones de upload que consumen
 * ancho de banda y almacenamiento.
 *
 * Configuración:
 * - windowMs: 1 hora
 * - max: 20 uploads por hora
 *
 * Uso recomendado:
 * - POST /documents/upload
 * - Cualquier endpoint que maneje archivos
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Maximum 100 files uploaded per hour
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  message: {
    error: 'File upload limit exceeded.',
    retryAfter: 'You have reached the file upload limit per hour.'
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Upload Limit Exceeded',
      message: 'You have reached the file upload limit per hour. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
      maxUploadsPerHour: 100
    });
  }
});

/**
 * Rate Limiter Flexible
 *
 * Función helper para crear rate limiters personalizados con configuración específica.
 *
 * @param windowMinutes - Ventana de tiempo en minutos
 * @param maxRequests - Número máximo de peticiones
 * @param message - Mensaje personalizado de error
 * @returns Middleware de rate limiting configurado
 *
 * Ejemplo de uso:
 * ```typescript
 * const customLimiter = createCustomRateLimiter(5, 10, 'Límite personalizado excedido');
 * router.get('/api/custom', customLimiter, customController);
 * ```
 */
export const createCustomRateLimiter = (
  windowMinutes: number,
  maxRequests: number,
  message: string = 'Request limit exceeded'
) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: message,
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });
};

/**
 * Configuración Avanzada: Rate Limiter por IP y Usuario
 *
 * Este limiter combina la dirección IP con el ID del usuario autenticado
 * para una limitación más precisa.
 *
 * Nota: Requiere que el usuario esté autenticado. El objeto req.user debe estar disponible.
 */
export const userBasedRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    return process.env.NODE_ENV === 'test';
  },
  // Función para generar una clave única por usuario/IP
  keyGenerator: (req: Request) => {
    // Si el usuario está autenticado, usa su ID + IP
    // Si no, solo usa la IP
    const userId = (req as any).user?.id || 'anonymous';
    const ip = ipKeyGenerator(req);
    return `${userId}-${ip}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'User Rate Limit Exceeded',
      message: 'You have exceeded the request limit allowed for your account.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Instrucciones de Instalación:
 *
 * 1. Instalar la dependencia:
 *    npm install express-rate-limit
 *    npm install --save-dev @types/express-rate-limit
 *
 * 2. Aplicar globalmente en app.ts:
 *    import { generalRateLimiter } from './middlewares/rate-limit.middleware';
 *    app.use(generalRateLimiter);
 *
 * 3. Aplicar a rutas específicas:
 *    import { authRateLimiter, uploadRateLimiter } from './middlewares/rate-limit.middleware';
 *
 *    router.post('/auth/login', authRateLimiter, authController.login);
 *    router.post('/documents/upload', uploadRateLimiter, documentController.upload);
 *
 * 4. Configuración con proxy/load balancer (si aplica):
 *    En app.ts, antes de usar el middleware:
 *    app.set('trust proxy', 1); // Confiar en el primer proxy
 *
 * 5. Uso de Redis para aplicaciones distribuidas (opcional):
 *    Para aplicaciones con múltiples instancias, considera usar Redis como store:
 *
 *    import RedisStore from 'rate-limit-redis';
 *    import { createClient } from 'redis';
 *
 *    const redisClient = createClient({ url: 'redis://localhost:6379' });
 *
 *    export const distributedRateLimiter = rateLimit({
 *      store: new RedisStore({
 *        client: redisClient,
 *        prefix: 'rl:' // prefijo para las claves en Redis
 *      }),
 *      windowMs: 15 * 60 * 1000,
 *      max: 100
 *    });
 */

/**
 * Mejores Prácticas:
 *
 * 1. Aplicar diferentes límites según el tipo de operación:
 *    - Operaciones de lectura: Más permisivo (100-200 req/15min)
 *    - Operaciones de escritura: Moderado (30-50 req/hora)
 *    - Autenticación: Restrictivo (5-10 req/15min)
 *    - Uploads: Muy restrictivo (10-20 req/hora)
 *
 * 2. Considerar el contexto del usuario:
 *    - Usuarios premium: Límites más altos
 *    - Usuarios free: Límites estándar
 *    - IP sospechosas: Límites más bajos
 *
 * 3. Monitorear y ajustar:
 *    - Registrar eventos de rate limiting
 *    - Analizar patrones de uso
 *    - Ajustar límites según necesidad
 *
 * 4. Comunicar claramente los límites:
 *    - Documentar límites en la API
 *    - Incluir headers informativos
 *    - Proporcionar mensajes de error claros
 *
 * 5. Combinar con otras medidas de seguridad:
 *    - CAPTCHA después de múltiples intentos fallidos
 *    - Bloqueo temporal de cuentas
 *    - Notificaciones de seguridad
 */
