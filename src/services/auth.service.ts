import bcrypt from 'bcryptjs';
import { signToken } from './jwt.service';
import User, { IUser } from '../models/user.model';
import { validatePasswordOrThrow } from '../utils/password-validator';

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
 * Valida la fortaleza de la contraseña antes de hashearla
 * Hashea la contraseña antes de almacenarla
 * 
 * @param RegisterUserDto - Datos del usuario a registrar
 * @returns Usuario creado (sin contraseña)
 * @throws Error si la contraseña no cumple los requisitos de seguridad
 */
export async function registerUser({ name, email, password, role = 'user' }: RegisterUserDto): Promise<Partial<IUser>> {
  // Validar nombre (solo alfanumérico y espacios)
  const nameRegex = /^[a-zA-Z0-9\s]+$/;
  if (!name || !nameRegex.test(name.trim())) {
    throw new Error('Name must contain only alphanumeric characters and spaces');
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;
  if (!email || !emailRegex.test(email.toLowerCase())) {
    throw new Error('Invalid email format');
  }

  // Validar fortaleza de la contraseña
  validatePasswordOrThrow(password);
  
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const user = await User.create({ name, email, password: hashed, role });
  return user.toJSON();
}

/**
 * Autentica un usuario y genera un token JWT
 * Valida las credenciales y retorna el token de acceso
 * 
 * @param LoginUserDto - Credenciales del usuario
 * @returns Token JWT y datos del usuario
 * @throws Error si las credenciales son inválidas
 */
export async function loginUser({ email, password }: LoginUserDto): Promise<AuthResponse> {
  // Validar explícitamente los tipos para evitar inyección NoSQL u otros valores inesperados
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new Error('Invalid credentials');
  }

  const user = await User.findOne({ email: { $eq: email } });
  if (!user) throw new Error('User not found');
  
  // Validar que el usuario esté activo
  if (!user.active) {
    throw new Error('User account is not active');
  }
  
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid password');
  
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
