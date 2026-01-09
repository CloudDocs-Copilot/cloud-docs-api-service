import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import openapiSpec from './docs/openapi.json';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import userRoutes from './routes/user.routes';
import organizationRoutes from './routes/organization.routes';
import HttpError from './models/error.model';
import { errorHandler } from './middlewares/error.middleware';
import { generalRateLimiter } from './middlewares/rate-limit.middleware';
import { getCorsOptions } from './configurations/cors-config';

const app = express();

// Configuración de proxy confiable (importante si está detrás de un proxy inverso/balanceador de carga)
// Esto asegura que la IP real del cliente sea correctamente identificada
app.set('trust proxy', 1);

// Middlewares de seguridad
// Helmet ayuda a proteger aplicaciones Express estableciendo varios headers HTTP
app.use(helmet({
  // Content Security Policy - ayuda a prevenir ataques XSS
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Requerido para Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"], // Requerido para Swagger UI
      imgSrc: ["'self'", "data:", "https:"], // Permite imágenes propias, URIs de datos y HTTPS
    },
  },
  // X-Frame-Options - previene ataques de clickjacking
  frameguard: { action: 'deny' },
  // X-Content-Type-Options - previene el sniffing de tipos MIME
  noSniff: true,
  // Strict-Transport-Security - fuerza el uso de HTTPS
  hsts: {
    maxAge: 31536000, // 1 año en segundos
    includeSubDomains: true,
    preload: true,
  },
  // X-XSS-Protection - habilita el filtro XSS del navegador
  xssFilter: true,
  // Referrer-Policy - controla la información del referrer
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-Permitted-Cross-Domain-Policies - restringe Adobe Flash y PDF
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  // Elimina el header X-Powered-By para ocultar Express
  hidePoweredBy: true,
}));

// Configuración CORS - ajustes de seguridad específicos por entorno
// Desarrollo: Permite orígenes localhost automáticamente
// Producción: Solo permite dominios explícitamente autorizados desde la variable ALLOWED_ORIGINS
app.use(cors(getCorsOptions()));

// Middleware para parsear cookies
app.use(cookieParser());

// Middleware de parsing del body
app.use(express.json());

// Protección contra inyección NoSQL
// Sanitiza los datos de entrada eliminando caracteres especiales de MongoDB ($, .)
// Previene ataques de inyección NoSQL en queries, actualizaciones y agregaciones
// Ejemplo: convierte { "$gt": "" } en { "gt": "" }
app.use(mongoSanitize({
  // Reemplaza caracteres prohibidos en lugar de eliminarlos
  replaceWith: '_',
  // Opción adicional: onSanitize se puede usar para logging cuando se detecta un intento de inyección
}));

// Aplica limitación de tasa general a todas las rutas
app.use(generalRateLimiter);

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/users', userRoutes);

// Documentación Swagger/OpenAPI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));
app.get('/api/docs.json', (_req: Request, res: Response) => res.json(openapiSpec));

// Ruta raíz de la API
app.get('/api', (_req: Request, res: Response) => {
  res.json({ message: 'API running' });
});

// Captura 404 (después de todas las rutas definidas y antes del manejador de errores)
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new HttpError(404, 'Route not found'));
});

// Manejador global de errores
app.use(errorHandler);

export default app;
