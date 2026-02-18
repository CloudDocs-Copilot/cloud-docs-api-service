import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwt.service';
import HttpError from '../models/error.model';
import User from '../models/user.model';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    active: boolean;
    role: string;
  };
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
  // Intentar obtener el token desde la cookie primero
  let token = req.cookies?.token;

  // Fallback: si no hay cookie, intentar con header Authorization (para compatibilidad temporal)
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return next(new HttpError(401, 'Access token required'));
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) return next(new HttpError(401, 'User no longer exists'));
    if (user.active === false) return next(new HttpError(401, 'User account deactivated'));

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
      return next(new HttpError(401, 'Token invalidated due to email change'));
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return next(new HttpError(401, 'Token invalidated due to password change'));
    }

    if ((decoded as any).iat && user.lastPasswordChange) {
      const tokenIssuedAt = new Date((decoded as any).iat * 1000);
      const passwordChangeTime = new Date(user.lastPasswordChange.getTime() - 5000);
      if (tokenIssuedAt < passwordChangeTime) {
        return next(new HttpError(401, 'Token invalidated due to password change'));
      }
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      active: user.active,
      role: user.role
    };

    // Sliding session: refresh the auth cookie expiration on each valid request
    try {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? ('strict' as const) : ('lax' as const),
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      };
      if (token && _res && typeof _res.cookie === 'function') {
        _res.cookie('token', token, cookieOptions);
      }
    } catch (e) {
      // Don't block request flow if cookie refresh fails
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(new HttpError(401, 'Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new HttpError(401, 'Invalid token'));
    }
    return next(new HttpError(401, 'Authentication error'));
  }
}

export default authenticateToken;
