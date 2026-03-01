import { Request, Response, NextFunction, CookieOptions } from 'express';
import { RegisterUserDto, LoginUserDto, ResetPasswordDto } from '../services/auth.service';
import { AuthRequest } from '../middlewares/auth.middleware';
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
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions: CookieOptions = {
      httpOnly: true, // La cookie no es accesible desde JavaScript del cliente
      secure: isProd, // Solo HTTPS en producción
      sameSite: isProd ? 'strict' : 'lax', // Protección CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
      path: '/' // Cookie disponible en toda la aplicación
    };

    // Enviar token en cookie HttpOnly
    res.cookie('token', result.token, cookieOptions);

    // Devolver solo los datos del usuario, no el token
    res.json({ message: 'Login successful', user: result.user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'User not found') return next(new HttpError(404, 'Invalid credentials'));
    if (msg === 'Invalid password') return next(new HttpError(401, 'Invalid credentials'));
    if (msg === 'User account is not active')
      return next(new HttpError(403, 'Account is not active'));
    next(err);
  }
}

/**
 * Controlador de cierre de sesión
 * Limpia la cookie del token JWT
 */
export function logout(_req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    // Limpiar la cookie del token
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });
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

    // opcional recomendado: limpiar cookie si existiera
    const isProdForReset = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProdForReset,
      sameSite: isProdForReset ? 'strict' : 'lax',
      path: '/'
    });

    res.json({ message: 'Password reset successful' });
    return;
  } catch (err: unknown) {
    return next(err);
  }
}

export default { register, login, logout };
