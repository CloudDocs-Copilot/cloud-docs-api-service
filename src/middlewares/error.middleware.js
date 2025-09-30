const HttpError = require('../models/error.model');

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || undefined
    });
  }
  console.error('[unhandled-error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}

module.exports = errorHandler;
