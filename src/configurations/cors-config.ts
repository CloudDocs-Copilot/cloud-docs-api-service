import { CorsOptions } from 'cors';

/**
 * Configuración CORS (Cross-Origin Resource Sharing)
 * 
 * CORS es una característica de seguridad que restringe qué dominios pueden acceder a la API.
 * Esta configuración separa los entornos de desarrollo y producción para asegurar medidas
 * de seguridad apropiadas.
 * 
 * Beneficios de Seguridad:
 * - Previene que dominios no autorizados accedan a la API
 * - Protege contra ataques CSRF
 * - Controla qué métodos HTTP están permitidos
 * - Gestiona el compartir credenciales entre orígenes
 * - Establece tiempos de caché apropiados para peticiones preflight
 */

/**
 * Obtiene los orígenes permitidos según el entorno
 * 
 * Desarrollo: Permite localhost y puertos comunes de desarrollo
 * Producción: Solo permite dominios explícitamente autorizados desde variables de entorno
 * 
 * @returns Array de URLs de orígenes permitidos
 */
const getAllowedOrigins = (): string[] => {
  const environment = process.env.NODE_ENV || 'development';

  if (environment === 'production') {
    // En producción, solo permite orígenes explícitamente definidos
    // Múltiples orígenes pueden separarse con comas en la variable de entorno
    const origins = process.env.ALLOWED_ORIGINS || '';
    
    if (!origins) {
      console.warn(
        '⚠️  WARNING: No ALLOWED_ORIGINS defined in production environment. ' +
        'API will reject all cross-origin requests!'
      );
      return [];
    }

    return origins.split(',').map(origin => origin.trim());
  }

  // Entorno de desarrollo - permite URLs locales comunes de desarrollo
  return [
    'http://localhost:3000',      // React por defecto
    'http://localhost:3001',      // Puerto alternativo React
    'http://locahost:4000',
    'http://localhost:4200',      // Angular por defecto
    'http://localhost:5173',      // Vite por defecto
    'http://localhost:8080',      // Vue por defecto
    'http://127.0.0.1:3000',      // Variante con IP localhost
    'http://127.0.0.1:4200',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',

  ];
};

/**
 * Configuración CORS para Entorno de Desarrollo
 * 
 * Configuración relajada para facilitar el desarrollo:
 * - Permite múltiples orígenes localhost
 * - Habilita credenciales
 * - Permite métodos HTTP comunes
 * - Tiempo de caché preflight más corto
 */
const developmentCorsOptions: CorsOptions = {
  // Función de validación de origen
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // Permite peticiones sin origen (como apps móviles, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }

    // Verifica si el origen está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },

  // Permite credenciales (cookies, headers de autorización, certificados TLS)
  credentials: true,

  // Métodos HTTP permitidos
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Headers permitidos en peticiones
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-TOKEN',
  ],

  // Headers expuestos al cliente
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'X-Request-Id',
  ],

  // Duración del caché preflight (en segundos)
  // Más corto en desarrollo para iteración rápida
  maxAge: 600, // 10 minutos

  // Continuar al siguiente middleware incluso si falla la verificación CORS
  preflightContinue: false,

  // Código de estado para petición OPTIONS exitosa
  optionsSuccessStatus: 204,
};

/**
 * Configuración CORS para Entorno de Producción
 * 
 * Configuración estricta para seguridad:
 * - Solo permite orígenes explícitamente autorizados
 * - Valida el origen estrictamente
 * - Tiempo de caché preflight más largo
 * - Registro detallado para monitoreo de seguridad
 */
const productionCorsOptions: CorsOptions = {
  // Validación estricta de origen
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // En producción, rechaza peticiones sin origen para APIs
    // (puede ajustarse según el caso de uso)
    if (!origin) {
      // Permite comunicación servidor-a-servidor si es necesario
      const allowNoOrigin = process.env.ALLOW_NO_ORIGIN === 'true';
      if (allowNoOrigin) {
        return callback(null, true);
      }
      return callback(new Error('Origin header is required'));
    }

    // Verificación estricta de origen
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Registra evento de seguridad para monitoreo
      console.error(
        `🚨 SECURITY: CORS blocked unauthorized access attempt from origin: ${origin}`,
        {
          timestamp: new Date().toISOString(),
          origin,
          allowedOrigins,
        }
      );
      callback(new Error('Not allowed by CORS policy'));
    }
  },

  // Permite credenciales (requerido para autenticación basada en cookies)
  credentials: true,

  // Restringe solo a métodos HTTP necesarios
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],

  // Headers permitidos - ser específico en producción
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-TOKEN',
    'Accept',
    'Origin'
  ],

  // Headers expuestos mínimos por seguridad
  exposedHeaders: [
    'Content-Length',
    'X-Request-Id',
  ],

  // Tiempo de caché más largo en producción para reducir peticiones preflight
  maxAge: 86400, // 24 horas

  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Obtiene la configuración CORS basada en el entorno actual
 * 
 * @returns CorsOptions configurado para el entorno actual
 */
export const getCorsOptions = (): CorsOptions => {
  const environment = process.env.NODE_ENV || 'development';

  if (environment === 'production') {
    if (process.env.NODE_ENV !== 'test') {
      console.log('🔒 Using PRODUCTION CORS configuration');
    }
    return productionCorsOptions;
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log('🔓 Using DEVELOPMENT CORS configuration');
  }
  return developmentCorsOptions;
};

/**
 * Variables de Entorno Requeridas:
 * 
 * Requeridas en Producción:
 * - ALLOWED_ORIGINS: Lista separada por comas de URLs de orígenes permitidos
 *   Ejemplo: https://example.com,https://www.example.com,https://app.example.com
 * 
 * Opcionales:
 * - NODE_ENV: Nombre del entorno (development/production/test)
 * - ALLOW_NO_ORIGIN: Establecer en 'true' para permitir peticiones sin header de origen en producción
 * 
 * Uso en app.ts:
 * ```typescript
 * import cors from 'cors';
 * import { getCorsOptions } from './configurations/cors-config';
 * 
 * app.use(cors(getCorsOptions()));
 * ```
 * 
 * Mejores Prácticas de Seguridad:
 * 
 * 1. Siempre define ALLOWED_ORIGINS en producción
 * 2. Usa URLs HTTPS en orígenes de producción
 * 3. No uses comodines (*) en producción
 * 4. Mantén la lista de orígenes permitidos mínima
 * 5. Monitorea los logs de rechazo CORS para amenazas de seguridad
 * 6. Prueba la configuración CORS antes de desplegar
 * 7. Usa credentials: true solo si necesitas cookies/headers de autenticación
 * 8. Revisa y actualiza regularmente los orígenes permitidos
 * 
 * Pruebas CORS:
 * ```bash
 * # Probar desde origen permitido
 * curl -H "Origin: http://localhost:3000" \
 *      -H "Access-Control-Request-Method: POST" \
 *      -H "Access-Control-Request-Headers: Content-Type" \
 *      -X OPTIONS \
 *      http://localhost:4000/api/auth/login
 * 
 * # Debería recibir el header Access-Control-Allow-Origin en la respuesta
 * ```
 */

export default getCorsOptions;
