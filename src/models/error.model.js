class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = parseInt(statusCode, 10) || 500;
    this.details = details;
    this.name = 'HttpError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = HttpError;
