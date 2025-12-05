import bcrypt from 'bcryptjs';
import { signToken } from './jwt.service';
import User, { IUser } from '../models/user.model';

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
}

export interface LoginUserDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: Partial<IUser>;
}

export async function registerUser({ name, email, password, role = 'user' }: RegisterUserDto): Promise<Partial<IUser>> {
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const user = await User.create({ name, email, password: hashed, role });
  return user.toJSON();
}

export async function loginUser({ email, password }: LoginUserDto): Promise<AuthResponse> {
  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');
  
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
