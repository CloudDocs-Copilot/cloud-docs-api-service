import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registerUser, loginUser, refreshSession, revokeRefresh } from '../services/auth.service';
import HttpError from '../models/error.model';

function cookieBaseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? ('strict' as const) : ('lax' as const),
    path: '/',
  };
}

export async function register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, organizationId } = req.body;

    if (!name || !email || !password || !organizationId) {
      return next(new HttpError(400, 'Missing required fields (name, email, password, organizationId)'));
    }

    const user = await registerUser(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate key')) {
      return next(new HttpError(409, 'Email already registered'));
    } 
    next(err);
  }
}

export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return next(new HttpError(400, 'Missing required fields'));
    }

    const result = await loginUser({ email, password, rememberMe });

    // Access cookie: 15 min (900000 ms)
    res.cookie('token', result.accessToken, {
      ...cookieBaseOptions(),
      maxAge: 15 * 60 * 1000,
    });

    // Refresh cookie: 30 días SOLO si rememberMe
    if (rememberMe && result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        ...cookieBaseOptions(),
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    } else {
      // si no pidió rememberMe, por seguridad limpia refresh anterior si existiera
      res.clearCookie('refreshToken', { ...cookieBaseOptions() });
    }

    res.json({ message: 'Login successful', user: result.user });
    } catch (err: any) {
    // Si el service ya tiró HttpError, lo mandamos tal cual (mantiene status y mensaje)
    if (err instanceof HttpError) return next(err);

    // Fallback defensivo por si llega otro tipo de error.
    if (err?.message) {
      if (err.message === 'User not found') return next(new HttpError(404, 'Usuario no existe'));
      if (err.message === 'Invalid password') return next(new HttpError(401, 'Contraseña incorrecta'));
      if (err.message === 'User account is not active') return next(new HttpError(403, 'Cuenta desactivada'));

      if (typeof err.message === 'string' && err.message.startsWith('Account locked')) {
        return next(new HttpError(423, err.message));
      }
    }

    return next(new HttpError(500, 'Internal server error'));
  }
}

/**
 * POST /api/auth/refresh
 * Requiere cookie refreshToken
 * Devuelve user y setea nuevas cookies (access + refresh rotado)
 */
export async function refresh(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const result = await refreshSession(refreshToken);

    // nuevo access 15m
    res.cookie('token', result.accessToken, {
      ...cookieBaseOptions(),
      maxAge: 15 * 60 * 1000,
    });

    // refresh rotado 30d
    res.cookie('refreshToken', result.refreshToken, {
      ...cookieBaseOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Session refreshed', user: result.user });
  } catch (err: any) {
    next(err);
  }
}

/**
 * Logout: limpia cookies y revoca refresh si existe
 * (NO necesita authMiddleware)
 */
export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;
    await revokeRefresh(refreshToken);

    res.clearCookie('token', { ...cookieBaseOptions() });
    res.clearCookie('refreshToken', { ...cookieBaseOptions() });

    res.json({ message: 'Logout successful' });
  } catch (err: any) {
    next(err);
  }
}

export default { register, login, refresh, logout };
