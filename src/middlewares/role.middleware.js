const HttpError = require('../models/error.model');

function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Forbidden'));
  }
  next();
}

module.exports = { requireAdmin };
