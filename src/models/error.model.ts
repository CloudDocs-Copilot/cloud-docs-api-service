class HttpError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.statusCode = parseInt(String(statusCode), 10) || 500;
    this.details = details;
    this.name = 'HttpError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export default HttpError;
