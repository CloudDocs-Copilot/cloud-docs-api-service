import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/user.model';
import HttpError from '../models/error.model';
import { validatePasswordOrThrow } from '../utils/password-validator';

/**
 * DTO para actualización de datos de usuario
 */
export interface UpdateUserDto {
  name?: string;
  email?: string;
}

/**
 * DTO para cambio de contraseña
 */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

/**
 * DTO para actualización de avatar
 */
export interface UpdateAvatarDto {
  avatar: string;
}

/**
 * Obtiene todos los usuarios del sistema
 * La contraseña se excluye automáticamente por la transformación del esquema
 * 
 * @returns Lista de usuarios
 */
export async function getAllUsers(): Promise<IUser[]> {
  return User.find();
}

/**
 * Activa o desactiva un usuario
 * Al cambiar el estado, se actualiza updatedAt lo que invalida tokens activos
 * 
 * @param id - ID del usuario
 * @param active - Estado activo (true/false)
 * @returns Usuario actualizado
 */
export async function setUserActive(id: string, active: boolean): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.active === active) return user; // sin cambios
  
  user.active = active;
  await user.save();
  return user;
}

/**
 * Actualiza los datos de un usuario (nombre y/o email)
 * 
 * @param id - ID del usuario
 * @param UpdateUserDto - Datos a actualizar
 * @returns Usuario actualizado
 */
export async function updateUser(id: string, { name, email }: UpdateUserDto): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  
  await user.save();
  return user;
}

/**
 * Cambia la contraseña de un usuario
 * Valida la fortaleza de la nueva contraseña
 * Valida la contraseña actual e invalida todos los tokens existentes
 * 
 * @param id - ID del usuario
 * @param ChangePasswordDto - Contraseñas actual y nueva
 * @returns Mensaje de confirmación
 * @throws Error si la nueva contraseña no cumple los requisitos de seguridad
 */
export async function changePassword(id: string, { currentPassword, newPassword }: ChangePasswordDto): Promise<{ message: string }> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new HttpError(401, 'Current password is incorrect');
  
  // Validar fortaleza de la nueva contraseña
  validatePasswordOrThrow(newPassword);
  
  const saltRounds = 10;
  user.password = await bcrypt.hash(newPassword, saltRounds);
  user.lastPasswordChange = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  
  return { message: 'Password updated successfully' };
}

/**
 * Elimina permanentemente un usuario del sistema (borrado duro)
 * 
 * @param id - ID del usuario a eliminar
 * @returns Usuario eliminado
 */
export async function deleteUser(id: string): Promise<IUser> {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

/**
 * Actualiza el avatar de un usuario
 * 
 * @param id - ID del usuario
 * @param UpdateAvatarDto - URL o path del avatar
 * @returns Usuario actualizado
 */
export async function updateAvatar(id: string, { avatar }: UpdateAvatarDto): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  
  user.avatar = avatar;
  await user.save();
  return user;
}

export default {
  getAllUsers,
  setUserActive,
  updateUser,
  changePassword,
  deleteUser,
  updateAvatar
};
