import bcrypt from 'bcryptjs';
import { signToken } from './jwt.service';
import User, { IUser } from '../models/user.model';
import { validatePasswordOrThrow } from '../utils/password-validator';
import HttpError from '../models/error.model';

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

/**
 * DTO para registro de usuario
 */
export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

/**
 * DTO para inicio de sesión
 */
export interface LoginUserDto {
  email: string;
  password: string;
}

/**
 * Respuesta de autenticación con token y datos de usuario
 */
export interface AuthResponse {
  token: string;
  user: Partial<IUser>;
}

/**
 * Registra un nuevo usuario en el sistema
 * El usuario se registra sin organización ni rootFolder
 * El rootFolder se crea cuando el usuario se une o crea una organización (en Membership)
 * 
 * Valida la fortaleza de la contraseña antes de hashearla
 * Hashea la contraseña antes de almacenarla
 * 
 * @param RegisterUserDto - Datos del usuario a registrar
 * @returns Usuario creado (sin contraseña)
 * @throws HttpError si la contraseña no cumple los requisitos de seguridad
 * @throws HttpError si el email ya está registrado
 */
export async function registerUser({ 
  name, 
  email, 
  password,
  role = 'user' 
}: RegisterUserDto): Promise<Partial<IUser>> {
  // Validar nombre (solo alfanumérico y espacios)
  const nameRegex = /^[a-zA-Z0-9\s]+$/;
  if (!name || !nameRegex.test(name.trim())) {
    throw new HttpError(400, 'Name must contain only alphanumeric characters and spaces');
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
  if (!email || !emailRegex.test(email.toLowerCase())) {
    throw new HttpError(400, 'Invalid email format');
  }

  // Validar fortaleza de la contraseña
  validatePasswordOrThrow(password);
  
  // Hashear contraseña
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  
  try {
    // Crear usuario sin organización ni rootFolder
    const user = await User.create({ 
      name, 
      email, 
      password: hashed, 
      role,
      organization: undefined,
      rootFolder: undefined,
      storageUsed: 0,
      active: true
    });
    
    // Retornar datos del usuario (incluyendo _id manualmente)
    const userObj = user.toJSON();
    return {
      ...userObj,
      _id: user._id,
    };
  } catch (error) {
    // Re-lanzar el error original
    throw error;
  }
}

/**
 * Autentica un usuario y genera un token JWT
 * Valida las credenciales y retorna el token de acceso
 * 
 * @param LoginUserDto - Credenciales del usuario
 * @returns Token JWT y datos del usuario
 * @throws HttpError si las credenciales son inválidas
 */
export async function loginUser({ email, password }: LoginUserDto): Promise<AuthResponse> {
  // Validar explícitamente los tipos para evitar inyección NoSQL u otros valores inesperados
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new HttpError(400, 'Invalid credentials');
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) throw new HttpError(404, 'User not found');
  
  // Validar que el usuario esté activo
  if (!user.active) {
    throw new HttpError(403, 'User account is not active');
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new HttpError(401, 'Invalid password');
  
  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion
  });
  
  return { token, user: user.toJSON() };
}

export default {
  registerUser,
  loginUser
};
