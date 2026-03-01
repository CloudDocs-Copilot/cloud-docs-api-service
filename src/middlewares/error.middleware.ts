import { Request, Response, NextFunction } from 'express';
import HttpError from '../models/error.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorName(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.name === 'string') {
    return error.name;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Mapea errores específicos de Mongoose a respuestas HTTP estándar
 *
 * @param err - Error de Mongoose a mapear
 * @returns Objeto con status y mensaje, o null si no es un error de Mongoose conocido
 */
function mapMongooseError(err: unknown): { status: number; message: string } | null {
  const errorName = getErrorName(err);

  // ValidationError (validación de esquema)
  if (errorName === 'ValidationError') {
    console.error('[mongoose-validation-error]', err);
    return { status: 400, message: 'Validation failed' };
  }

  // CastError (ObjectId inválido)
  if (errorName === 'CastError') {
    return { status: 400, message: 'Invalid identifier format' };
  }

  // Error de clave duplicada (índice único)
  if (isRecord(err) && typeof err.code === 'number' && err.code === 11000) {
    const keyPattern = isRecord(err.keyPattern) ? err.keyPattern : undefined;
    const keyValue = isRecord(err.keyValue) ? err.keyValue : undefined;

    // Caso específico: índice único en Folder (owner+name)
    if (keyPattern?.owner === 1 && keyPattern?.name === 1) {
      return { status: 409, message: 'Folder name already exists for this user' };
    }
    // Caso específico: duplicado en campo `name` (por ejemplo Organization.name)
    if (keyValue?.name) {
      return { status: 409, message: 'Name already exists' };
    }
    const fields = Object.keys(keyValue ?? {});
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
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Error de aplicación tipado personalizado
  if (err instanceof HttpError) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[http-error]', {
        message: err.message,
        details: err.details,
        stack: err.stack
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
    return;
  }

  // Mapeo específico de Mongoose
  const mongooseMapped = mapMongooseError(err);
  if (mongooseMapped) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[mongoose-error]', {
        original: getErrorMessage(err),
        stack: getErrorStack(err)
      });
    }
    res.status(mongooseMapped.status).json({ success: false, error: mongooseMapped.message });
    return;
  }

  // Errores de token / librería de autenticación
  if (getErrorName(err) === 'TokenExpiredError') {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[auth-token-expired]', err);
    }
    res.status(401).json({ success: false, error: 'Token expired' });
    return;
  }

  if (getErrorName(err) === 'JsonWebTokenError') {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[auth-token-invalid]', err);
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  // Errores de Multer (carga de archivos)
  const multerErrCode = isRecord(err) && typeof err.code === 'string' ? err.code : undefined;
  if (multerErrCode && multerErrCode.startsWith('LIMIT_')) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[upload-limit]', err);
    }
    res.status(400).json({ success: false, error: 'File upload limits exceeded' });
    return;
  }

  // Respaldo para no manejados
  if (process.env.NODE_ENV !== 'test') {
    console.error('[unhandled-error]', err);
  }
  res.status(500).json({ success: false, error: 'Internal server error' });
}

export default errorHandler;
