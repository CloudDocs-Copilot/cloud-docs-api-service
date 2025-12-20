import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { registerUser, loginUser } from '../services/auth.service';
import HttpError from '../models/error.model';

/**
 * Controlador de registro de usuario
 * Valida datos requeridos, fortaleza de contraseña y registra nuevo usuario
 */
export async function register(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    
    const user = await registerUser(req.body);
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate key')) {
      return next(new HttpError(409, 'Email already registered'));
    }
    if (err.message && err.message.includes('Password validation failed')) {
      return next(new HttpError(400, err.message));
    }
    next(err);
  }
}

/**
 * Controlador de inicio de sesión
 * Autentica usuario y retorna token JWT
 */
export async function login(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message === 'User not found') return next(new HttpError(404, 'Invalid credentials'));
    if (err.message === 'Invalid password') return next(new HttpError(401, 'Invalid credentials'));
    next(err);
  }
}

export default { register, login };
