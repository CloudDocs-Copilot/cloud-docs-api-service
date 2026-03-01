/**
 * Clase de error HTTP personalizada
 *
 * Extiende la clase Error estándar para incluir códigos de estado HTTP
 * y detalles adicionales opcionales para el manejo de errores en la API
 *
 * @property statusCode - Código de estado HTTP (ej: 400, 404, 500)
 * @property details - Información adicional sobre el error (opcional)
 */
class HttpError extends Error {
  public statusCode: number;
  public details?: unknown;

  /**
   * Crea una nueva instancia de HttpError
   *
   * @param statusCode - Código de estado HTTP
   * @param message - Mensaje descriptivo del error
   * @param details - Detalles adicionales opcionales
   */
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = parseInt(String(statusCode), 10) || 500;
    this.details = details;
    this.name = 'HttpError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export default HttpError;
