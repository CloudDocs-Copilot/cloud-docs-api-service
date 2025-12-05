import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_dev';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  tokenVersion?: number;
  tokenCreatedAt?: string;
}

export interface SignTokenOptions {
  expiresIn?: string | number;
}

export function signToken(payload: Partial<TokenPayload>, options: SignTokenOptions = {}): string {
  const expiresIn: string | number = options.expiresIn || JWT_EXPIRES_IN;
  return jwt.sign(
    { ...payload, tokenCreatedAt: new Date().toISOString() } as object,
    JWT_SECRET,
    { expiresIn } as jwt.SignOptions
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export default {
  signToken,
  verifyToken
};
