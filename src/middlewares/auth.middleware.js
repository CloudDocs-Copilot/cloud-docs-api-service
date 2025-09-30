const jwtService = require('../services/jwt.service');
const HttpError = require('../models/error.model');
const User = require('../models/user.model');

// Middleware de autenticación avanzado
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next(new HttpError(401, 'Access token required'));

  try {
    const decoded = jwtService.verifyToken(token);
    const user = await User.findById(decoded.id);
      if (!user) return next(new HttpError(401, 'User no longer exists'));
    if (user.active === false) return next(new HttpError(401, 'User account deactivated'));

    if (decoded.tokenCreatedAt) {
      const tokenCreated = new Date(decoded.tokenCreatedAt);
      const userUpdated = new Date(user.updatedAt);
      if (userUpdated > tokenCreated) {
          return next(new HttpError(401, 'Token invalidated due to user changes'));
      }
    }

    if (decoded.email && decoded.email !== user.email) {
      return next(new HttpError(401, 'Token invalidated due to email change'));
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return next(new HttpError(401, 'Token invalidated due to password change'));
    }

    if (decoded.iat && user.lastPasswordChange) {
      const tokenIssuedAt = new Date(decoded.iat * 1000);
      const passwordChangeTime = new Date(user.lastPasswordChange.getTime() - 5000);
      if (tokenIssuedAt < passwordChangeTime) {
        return next(new HttpError(401, 'Token invalidated due to password change'));
      }
    }

    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      active: user.active,
      role: user.role
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new HttpError(401, 'Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new HttpError(401, 'Invalid token'));
    }
    return next(new HttpError(401, 'Authentication error'));
  }
}

module.exports = authenticateToken;
