import bcrypt from 'bcryptjs';
import { signToken } from './jwt.service';
import User, { IUser } from '../models/user.model';
import Organization from '../models/organization.model';
import Folder from '../models/folder.model';
import { validatePasswordOrThrow } from '../utils/password-validator';
import HttpError from '../models/error.model';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

/**
 * DTO para registro de usuario
 */
export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  organizationId: string;
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
 * Auto-crea la carpeta raíz del usuario
 * Valida cuota de usuarios por organización
 * 
 * @param RegisterUserDto - Datos del usuario a registrar
 * @returns Usuario creado (sin contraseña)
 * @throws HttpError si la contraseña no cumple los requisitos de seguridad
 * @throws HttpError si la organización no existe o ha alcanzado el límite de usuarios
 */
export async function registerUser({ 
  name, 
  email, 
  password, 
  organizationId,
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
  
  // Validar que organizationId sea un ObjectId válido
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new HttpError(400, 'Invalid organization ID');
  }
  
  // Verificar que la organización exista y esté activa
  const organization = await Organization.findOne({ 
    _id: organizationId, 
    active: true 
  });
  
  if (!organization) {
    throw new HttpError(404, 'Organization not found or inactive');
  }
  
  // Validar cuota de usuarios
  const currentUsersCount = await User.countDocuments({ 
    organization: organizationId,
    active: true 
  });
  
  if (currentUsersCount >= (organization.settings.maxUsers || 100)) {
    throw new HttpError(
      403,
      `Organization has reached maximum users limit (${organization.settings.maxUsers})`
    );
  }
  
  // Hashear contraseña
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  
  // Crear usuario con referencia a organización
  const user = await User.create({ 
    name, 
    email, 
    password: hashed, 
    role,
    organization: organizationId,
    storageUsed: 0
  });
  
  // Agregar usuario a la organización
  organization.members.push(user._id as mongoose.Types.ObjectId);
  await organization.save();
  
  // Crear carpeta raíz del usuario
  const rootFolderName = `root_user_${user._id}`;
  
  // Sanitizar org.slug para prevenir path traversal
  const safeSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const rootFolderPath = `/${safeSlug}/${user._id}`;
  
  // Crear directorio físico
  const storageRoot = path.join(process.cwd(), 'storage');
  const safeUserId = user._id.toString().replace(/[^a-z0-9]/gi, '');
  const userStoragePath = path.join(storageRoot, safeSlug, safeUserId);
  
  if (!fs.existsSync(userStoragePath)) {
    fs.mkdirSync(userStoragePath, { recursive: true });
  }
  
  // Crear carpeta raíz en la base de datos
  const rootFolder = await Folder.create({
    name: rootFolderName,
    displayName: 'Mi Unidad',
    type: 'root',
    organization: organizationId,
    owner: user._id,
    parent: null,
    path: rootFolderPath,
    permissions: [{
      userId: user._id,
      role: 'owner'
    }]
  });
  
  // Actualizar usuario con carpeta raíz
  user.rootFolder = rootFolder._id as mongoose.Types.ObjectId;
  await user.save();
  
  // Retornar datos del usuario (incluyendo _id manualmente)
  const userObj = user.toJSON();
  return {
    ...userObj,
    _id: user._id,
  };
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
