import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registerUser, loginUser, confirmUserAccount, requestPasswordReset, resetPassword } from '../services/auth.service';
import HttpError from '../models/error.model';

/**
 * Controlador de registro de usuario
 * Valida datos requeridos, fortaleza de contraseña y registra nuevo usuario
 */
export async function register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password} = req.body;
    
    if (!name || !email || !password) {
      return next(new HttpError(400, 'Missing required fields (name, email, password)'));
    }
    
    const user = await registerUser(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate key')) {
      return next(new HttpError(409, 'Email already registered'));
    }
    if (err.message && err.message.includes('Invalid email format')) {
      return next(new HttpError(400, 'Invalid email format'));
    }
    if (err.message && err.message.includes('Name must contain only alphanumeric characters and spaces')) {
      return next(new HttpError(400, 'Invalid name format'));
    }
    if (err.message && err.message.includes('Password validation failed')) {
      return next(new HttpError(400, err.message));
    }
    next(err);
  }
}

/**
 * Controlador de inicio de sesión
 * Autentica usuario y envía token JWT en cookie HttpOnly
 */
export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    
    if ( !email || !password) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    const result = await loginUser(req.body);
    
    // Configuración de la cookie
    const cookieOptions = {
      httpOnly: true, // La cookie no es accesible desde JavaScript del cliente
      secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const, // Protección CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
      path: '/' // Cookie disponible en toda la aplicación
    };
    
    // Enviar token en cookie HttpOnly
    res.cookie('token', result.token, cookieOptions);
    
    // Devolver solo los datos del usuario, no el token
    res.json({ message: 'Login successful', user: result.user });
  } catch (err: any) {
    if (err.message === 'User not found') return next(new HttpError(404, 'Invalid credentials'));
    if (err.message === 'Invalid password') return next(new HttpError(401, 'Invalid credentials'));
    if (err.message === 'User account is not active') return next(new HttpError(403, 'Account is not active'));
    next(err);
  }
}

/**
 * Controlador de cierre de sesión
 * Limpia la cookie del token JWT
 */
export async function logout(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Limpiar la cookie del token
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
      path: '/'
    });
    res.json({ message: 'Logout successful' });
  } catch (err: any) {
    next(err);
  }
}


/**
 * Controlador para confirmar cuenta de usuario mediante token JWT
 * Activa el usuario si el token es válido
 */
export async function confirmAccount(req: any, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    if (!token) {
      return next(new HttpError(400, 'Token is required'));
    }
    let result;
    try {
      result = await confirmUserAccount(token);
    } catch (err: any) {
      return next(new HttpError(400, err.message || 'Invalid or expired token'));
    }
    const frontendBase = (process.env.CONFIRMATION_FRONTEND_URL ||  `http://localhost:5173}`).replace(/\/$/, '');
    const redirectUrl = `${frontendBase}/auth/confirmed?userId=${encodeURIComponent(String(result.userId))}&status=${result.userAlreadyActive ? 'already_active' : 'confirmed'}`;

    ;
    if (result.userAlreadyActive) {
      // Redirigir al frontend (302)
     return res.redirect(302, redirectUrl)
    }
    // Redirigir al frontend (302)
     return res.redirect(302, redirectUrl)
  } catch (err) {
    next(err);
  }
}

/* Controlador para solicitar reseteo de contraseña*/
export async function forgotPassword(req: any, res: any, next: any) {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new HttpError(400, 'Missing required fields'));
    }

    await requestPasswordReset(email);

    // Anti-enumeración: mismo mensaje siempre
    return res.json({ message: 'Check your email, a link has been sent' });
  } catch (err) {
    return next(err);
  }
}

/* Controlador para resetear la contraseña usando token*/
export async function resetPasswordController(req: any, res: any, next: any) {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return next(new HttpError(400, 'Missing required fields'));
    }

    await resetPassword({ token, newPassword, confirmPassword });

    // opcional recomendado: limpiar cookie si existiera
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });

    return res.json({ message: 'Password reset successful' });
  } catch (err) {
    return next(err);
  }
}

export default { register, login, logout };
