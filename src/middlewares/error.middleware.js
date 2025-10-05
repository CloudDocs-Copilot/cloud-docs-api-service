const HttpError = require('../models/error.model');

function mapMongooseError(err) {
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

function errorHandler(err, req, res, _next) {
  // Error de aplicación tipado personalizado
  if (err instanceof HttpError) {
    console.error('[http-error]', { message: err.message, details: err.details, stack: err.stack });
    return res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
  }

  // Mapeo específico de Mongoose
  const mongooseMapped = mapMongooseError(err);
  if (mongooseMapped) {
    console.error('[mongoose-error]', { original: err.message, stack: err.stack });
    return res.status(mongooseMapped.status).json({ success: false, error: mongooseMapped.message });
  }

  // Errores de token / librería de autenticación
  if (err.name === 'TokenExpiredError') {
    console.error('[auth-token-expired]', err);
    return res.status(401).json({ success: false, error: 'Token expired' });
  }
  if (err.name === 'JsonWebTokenError') {
    console.error('[auth-token-invalid]', err);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Errores de Multer (carga de archivos)
  if (err.code && err.code.startsWith && err.code.startsWith('LIMIT_')) {
    console.error('[upload-limit]', err);
    return res.status(400).json({ success: false, error: 'File upload limits exceeded' });
  }

  // Respaldo para no manejados
  console.error('[unhandled-error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

module.exports = errorHandler;
