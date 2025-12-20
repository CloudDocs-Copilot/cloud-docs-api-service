import { Request, Response, NextFunction } from 'express';
import HttpError from '../models/error.model';

interface MongooseError extends Error {
  code?: number;
  keyPattern?: any;
  keyValue?: any;
}

interface MulterError extends Error {
  code?: string;
}

/**
 * Mapea errores específicos de Mongoose a respuestas HTTP estándar
 * 
 * @param err - Error de Mongoose a mapear
 * @returns Objeto con status y mensaje, o null si no es un error de Mongoose conocido
 */
function mapMongooseError(err: MongooseError): { status: number; message: string } | null {
  // ValidationError (validación de esquema)
  if (err.name === 'ValidationError') {
    return { status: 400, message: 'Validation failed' };
  }
  
  // CastError (ObjectId inválido)
  if (err.name === 'CastError') {
    return { status: 400, message: 'Invalid identifier format' };
  }
  
  // Error de clave duplicada (índice único)
  if (err.code && err.code === 11000) {
    // Caso específico: índice único en Folder (owner+name)
    if (err.keyPattern && err.keyPattern.owner === 1 && err.keyPattern.name === 1) {
      return { status: 409, message: 'Folder name already exists for this user' };
    }
    const fields = Object.keys(err.keyValue || {});
    return { status: 409, message: `Duplicate value for field(s): ${fields.join(', ')}` };
  }
  
  // Escenarios de no encontrado pueden viajar como HttpError desde los servicios
  return null;
}

/**
 * Manejador global de errores de la aplicación
 * 
 * Procesa y formatea diferentes tipos de errores:
 * - HttpError personalizado
 * - Errores de Mongoose (validación, cast, duplicados)
 * - Errores de JWT (expirado, inválido)
 * - Errores de Multer (límites de subida)
 * - Errores no manejados
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  // Error de aplicación tipado personalizado
  if (err instanceof HttpError) {
    console.error('[http-error]', { message: err.message, details: err.details, stack: err.stack });
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
    return;
  }

  // Mapeo específico de Mongoose
  const mongooseMapped = mapMongooseError(err);
  if (mongooseMapped) {
    console.error('[mongoose-error]', { original: err.message, stack: err.stack });
    res.status(mongooseMapped.status).json({ success: false, error: mongooseMapped.message });
    return;
  }

  // Errores de token / librería de autenticación
  if (err.name === 'TokenExpiredError') {
    console.error('[auth-token-expired]', err);
    res.status(401).json({ success: false, error: 'Token expired' });
    return;
  }
  
  if (err.name === 'JsonWebTokenError') {
    console.error('[auth-token-invalid]', err);
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  // Errores de Multer (carga de archivos)
  const multerErr = err as MulterError;
  if (multerErr.code && multerErr.code.startsWith('LIMIT_')) {
    console.error('[upload-limit]', err);
    res.status(400).json({ success: false, error: 'File upload limits exceeded' });
    return;
  }

  // Respaldo para no manejados
  console.error('[unhandled-error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

export default errorHandler;
