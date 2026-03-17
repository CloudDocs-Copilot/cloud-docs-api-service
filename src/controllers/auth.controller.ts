import { Request, Response, NextFunction } from 'express';
import { RegisterUserDto, LoginUserDto, ResetPasswordDto } from '../services/auth.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getAuthCookieOptions, getAuthCookieClearOptions, getCsrfCookieClearOptions } from '../utils/cookie-options';
import {
  registerUser,
  loginUser,
  confirmUserAccount,
  requestPasswordReset,
  resetPassword
} from '../services/auth.service';
import HttpError from '../models/error.model';

/**
 * Controlador de registro de usuario
 * Valida datos requeridos, fortaleza de contraseña y registra nuevo usuario
 */
export async function register(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, password } = req.body as RegisterUserDto;

    if (!name || !email || !password) {
      return next(new HttpError(400, 'Missing required fields (name, email, password)'));
    }

    const user = await registerUser(req.body as RegisterUserDto);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key')) {
      return next(new HttpError(409, 'Email already registered'));
    }
    if (msg.includes('Invalid email format')) {
      return next(new HttpError(400, 'Invalid email format'));
    }
    if (msg.includes('Name must contain only alphanumeric characters and spaces')) {
      return next(new HttpError(400, 'Invalid name format'));
    }
    if (msg.includes('Password validation failed')) {
      return next(new HttpError(400, msg));
    }
    next(err);
  }
}

/**
 * Controlador de inicio de sesión
 * Autentica usuario y envía token JWT en cookie HttpOnly
 */
export async function login(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as LoginUserDto;

    if (!email || !password) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    const result = await loginUser(req.body as LoginUserDto);

    // Configuración de la cookie
    const cookieOptions = getAuthCookieOptions();
    const tokenLength = result.token.length;
    
    // LOG: Diagnostico de inicio de sesión
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[AUTH-LOGIN-DIAGNOSTIC]', {
        timestamp: new Date().toISOString(),
        email: result.user.email,
        tokenLength,
        cookieOptions: {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          maxAge: cookieOptions.maxAge,
          path: cookieOptions.path
        },
        nodeEnv: process.env.NODE_ENV,
        requestOrigin: req.get('origin'),
        status: 'about_to_set_cookie'
      });
    }

    // Enviar token en cookie HttpOnly
    res.cookie('token', result.token, cookieOptions);

    // LOG: Cookie establecida
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[AUTH-LOGIN-DIAGNOSTIC]', {
        timestamp: new Date().toISOString(),
        email: result.user.email,
        status: 'cookie_set',
        setCookieHeader: res.getHeader('set-cookie')
      });
    }

    // Devolver solo los datos del usuario, no el token
    res.json({ message: 'Login successful', user: result.user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    
    // LOG: Error en login
    if (process.env.NODE_ENV !== 'test') {
      console.error('[AUTH-LOGIN-ERROR]', {
        timestamp: new Date().toISOString(),
        error: msg,
        requestOrigin: req.get('origin')
      });
    }
    
    if (msg === 'User not found') return next(new HttpError(404, 'Invalid credentials'));
    if (msg === 'Invalid password') return next(new HttpError(401, 'Invalid credentials'));
    if (msg === 'User account is not active')
      return next(new HttpError(403, 'Account is not active'));
    next(err);
  }
}

/**
 * Controlador de cierre de sesión
 * Limpia la cookie del token JWT y la cookie CSRF
 *
 * ✅ FIX CSRF 403: Limpiar cookies CSRF al desloguear para evitar que persistan
 * en la siguiente sesión de otro usuario
 */
export function logout(_req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    // Limpiar la cookie del token JWT
    res.clearCookie('token', getAuthCookieClearOptions());
    
    // ✅ FIX: Limpiar también la cookie CSRF para evitar conflictos cuando cambia el usuario
    // Si no se limpia, la cookie CSRF vieja persiste y causa 403 cuando otro usuario loguea
    res.clearCookie('psifi.x-csrf-token', getCsrfCookieClearOptions());
    
    res.json({ message: 'Logout successful' });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para confirmar cuenta de usuario mediante token JWT
 * Activa el usuario si el token es válido
 */
export async function confirmAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      return next(new HttpError(400, 'Token is required'));
    }
    let result: { userId: string; userName: string; userAlreadyActive: boolean };
    try {
      result = await confirmUserAccount(token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return next(new HttpError(400, msg || 'Invalid or expired token'));
    }
    const frontendBase = (
      process.env.CONFIRMATION_FRONTEND_URL || `http://localhost:5173`
    ).replace(/\/$/, '');
    const redirectUrl = `${frontendBase}/auth/confirmed?userId=${encodeURIComponent(String(result.userId))}&status=${result.userAlreadyActive ? 'already_active' : 'confirmed'}`;

    if (result.userAlreadyActive) {
      // Redirigir al frontend (302)
      res.redirect(302, redirectUrl);
      return;
    }
    // Redirigir al frontend (302)
    res.redirect(302, redirectUrl);
    return;
  } catch (err: unknown) {
    next(err);
  }
}

/* Controlador para solicitar reseteo de contraseña*/
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body as { email?: unknown };
    if (typeof email !== 'string' || !email) {
      return next(new HttpError(400, 'Missing required fields'));
    }

    await requestPasswordReset(email);

    // Anti-enumeración: mismo mensaje siempre
    res.json({ message: 'Check your email, a link has been sent' });
    return;
  } catch (err: unknown) {
    return next(err);
  }
}

/* Controlador para resetear la contraseña usando token*/
export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, newPassword, confirmPassword } = req.body as ResetPasswordDto;

    if (typeof token !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      return next(new HttpError(400, 'Missing required fields'));
    }

    await resetPassword({ token, newPassword, confirmPassword });

    // Limpiar cookies: JWT y CSRF (similar a logout)
    // el usuario necesitará loguear de nuevo tras resetear contraseña
    res.clearCookie('token', getAuthCookieClearOptions());
    res.clearCookie('psifi.x-csrf-token', getCsrfCookieClearOptions());

    res.json({ message: 'Password reset successful' });
    return;
  } catch (err: unknown) {
    return next(err);
  }
}

export default { register, login, logout };
