import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/user.model';
import HttpError from '../models/error.model';

export interface UpdateUserDto {
  name?: string;
  email?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export async function getAllUsers(): Promise<IUser[]> {
  // Retorna todos los usuarios (la contraseña se elimina por la transformación del esquema)
  return User.find();
}

export async function setUserActive(id: string, active: boolean): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.active === active) return user; // sin cambios
  
  user.active = active;
  // Al actualizar el usuario, se actualiza updatedAt (esto invalida tokens de ese usuario)
  await user.save();
  return user;
}

export async function updateUser(id: string, { name, email }: UpdateUserDto): Promise<IUser> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  
  await user.save();
  return user;
}

export async function changePassword(id: string, { currentPassword, newPassword }: ChangePasswordDto): Promise<{ message: string }> {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new HttpError(401, 'Current password is incorrect');
  
  const saltRounds = 10;
  user.password = await bcrypt.hash(newPassword, saltRounds);
  user.lastPasswordChange = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  
  return { message: 'Password updated successfully' };
}

// Servicio de borrado duro de usuario
export async function deleteUser(id: string): Promise<IUser> {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

export default {
  getAllUsers,
  setUserActive,
  updateUser,
  changePassword,
  deleteUser
};
