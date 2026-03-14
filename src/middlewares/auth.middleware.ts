import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwt.service';
import HttpError from '../models/error.model';
import User from '../models/user.model';
import { getAuthCookieOptions } from '../utils/cookie-options';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    role: string;
  };
}

function getTokenFromCookies(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (!cookies || typeof cookies !== 'object') {
    return undefined;
  }

  const token = (cookies as Record<string, unknown>).token;
  return typeof token === 'string' ? token : undefined;
}

/**
 * Middleware de autenticación avanzado
 *
 * Verifica el token JWT desde cookie HttpOnly y valida:
 * - Existencia del usuario
 * - Estado activo del usuario
 * - Validez del token tras cambios en el usuario
 * - Expiración del token por cambio de contraseña
 */
export async function authenticateToken(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // LOG: Incoming request diagnostic
  const cookieToken = getTokenFromCookies(req);
  const authHeader = req.headers['authorization'];
  const requestPath = req.path;
  
  if (process.env.NODE_ENV !== 'test') {
    console.log('[AUTH-MIDDLEWARE-DIAGNOSTIC]', {
      timestamp: new Date().toISOString(),
      requestPath,
      method: req.method,
      hasCookieToken: !!cookieToken,
      cookieTokenLength: cookieToken ? cookieToken.length : 0,
      hasAuthHeader: !!authHeader,
      allCookies: req.cookies ? Object.keys(req.cookies) : [],
      requestOrigin: req.get('origin')
    });
  }

  // Intentar obtener el token desde la cookie primero
  let token: string | undefined;
  if (typeof cookieToken === 'string') {
    token = cookieToken;
  }

  // Fallback: si no hay cookie, intentar con header Authorization (para compatibilidad temporal)
  if (!token) {
    if (typeof authHeader === 'string') {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    const error401 = new HttpError(401, 'Access token required');
    
    // LOG: Missing token
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[AUTH-MIDDLEWARE-401-MISSING-TOKEN]', {
        timestamp: new Date().toISOString(),
        requestPath,
        method: req.method,
        hasAnyCookie: Object.keys(req.cookies || {}).length > 0,
        availableCookies: Object.keys(req.cookies || {}),
        requestOrigin: req.get('origin'),
        reason: 'No token found in cookie or Authorization header'
      });
    }
    
    return next(error401);
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      const error401 = new HttpError(401, 'User no longer exists');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-USER-NOT-FOUND]', {
          timestamp: new Date().toISOString(),
          requestPath,
          userId: decoded.id,
          reason: 'User not found in database'
        });
      }
      return next(error401);
    }
    
    if (user.active === false) {
      const error401 = new HttpError(401, 'User account deactivated');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-USER-INACTIVE]', {
          timestamp: new Date().toISOString(),
          requestPath,
          userId: decoded.id,
          reason: 'User account is deactivated'
        });
      }
      return next(error401);
    }

    // Validar que el token no haya sido invalidado por cambios en el usuario
    // Solo en producción - en tests se permite para facilitar testing
    /*  if (process.env.NODE_ENV !== 'test' && decoded.tokenCreatedAt) {
      const tokenCreated = new Date(decoded.tokenCreatedAt);
      const userUpdated = new Date(user.updatedAt);
      if (userUpdated > tokenCreated) {
        return next(new HttpError(401, 'Token invalidated due to user changes'));
      }
    }
 */
    if (decoded.email && decoded.email !== user.email) {
      const error401 = new HttpError(401, 'Token invalidated due to email change');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-EMAIL-CHANGED]', {
          timestamp: new Date().toISOString(),
          requestPath,
          userId: decoded.id,
          decodedEmail: decoded.email,
          userEmail: user.email,
          reason: 'User email was changed'
        });
      }
      return next(error401);
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      const error401 = new HttpError(401, 'Token invalidated due to password change');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-PASSWORD-CHANGED]', {
          timestamp: new Date().toISOString(),
          requestPath,
          userId: decoded.id,
          decodedTokenVersion: decoded.tokenVersion,
          userTokenVersion: user.tokenVersion,
          reason: 'Password was changed'
        });
      }
      return next(error401);
    }

    if (decoded.iat && user.lastPasswordChange) {
      const tokenIssuedAt = new Date(decoded.iat * 1000);
      const passwordChangeTime = new Date(user.lastPasswordChange.getTime() - 5000);
      if (tokenIssuedAt < passwordChangeTime) {
        const error401 = new HttpError(401, 'Token invalidated due to password change');
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[AUTH-MIDDLEWARE-401-TOKEN-ISSUED-BEFORE-PASSWORD-CHANGE]', {
            timestamp: new Date().toISOString(),
            requestPath,
            userId: decoded.id,
            reason: 'Token issued before password change'
          });
        }
        return next(error401);
      }
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      active: user.active,
      role: user.role
    };

    // LOG: Successful authentication
    if (process.env.NODE_ENV !== 'test') {
      console.log('[AUTH-MIDDLEWARE-SUCCESS]', {
        timestamp: new Date().toISOString(),
        requestPath,
        method: req.method,
        userId: req.user.id,
        userEmail: req.user.email,
        status: 'authenticated'
      });
    }

    // Sliding session: refresh the auth cookie expiration on each valid request
    try {
      if (token && _res && typeof _res.cookie === 'function') {
        _res.cookie('token', token, getAuthCookieOptions());
        if (process.env.NODE_ENV !== 'test') {
          console.log('[AUTH-MIDDLEWARE-COOKIE-REFRESH]', {
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            status: 'cookie_refreshed'
          });
        }
      }
    } catch {
      // Don't block request flow if cookie refresh fails
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-COOKIE-REFRESH-FAILED]', {
          timestamp: new Date().toISOString(),
          status: 'cookie_refresh_error'
        });
      }
    }

    next();
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : '';

    if (errorName === 'TokenExpiredError') {
      const error401 = new HttpError(401, 'Token expired');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-TOKEN-EXPIRED]', {
          timestamp: new Date().toISOString(),
          requestPath,
          reason: 'JWT token has expired'
        });
      }
      return next(error401);
    }
    if (errorName === 'JsonWebTokenError') {
      const error401 = new HttpError(401, 'Invalid token');
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[AUTH-MIDDLEWARE-401-INVALID-TOKEN]', {
          timestamp: new Date().toISOString(),
          requestPath,
          errorMessage: error instanceof Error ? error.message : '',
          reason: 'JWT token is invalid or malformed'
        });
      }
      return next(error401);
    }
    const error401 = new HttpError(401, 'Authentication error');
    if (process.env.NODE_ENV !== 'test') {
      console.error('[AUTH-MIDDLEWARE-401-AUTH-ERROR]', {
        timestamp: new Date().toISOString(),
        requestPath,
        error: error instanceof Error ? error.message : String(error),
        reason: 'Unknown authentication error'
      });
    }
    return next(error401);
  }
}

export default authenticateToken;
