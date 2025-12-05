import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import openapiSpec from './docs/openapi.json';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import userRoutes from './routes/user.routes';
import HttpError from './models/error.model';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/auth', authRoutes);
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
