import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_dev';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

// Por defecto (si no usas env vars)
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export type TokenType = 'access' | 'refresh';

/**
 * Estructura del payload del token JWT
 */
export interface TokenPayload {
  id: string;
  email?: string;
  role?: string;
  tokenVersion?: number;
  tokenCreatedAt?: string;
  type: TokenType;
}

export interface SignTokenOptions {
  expiresIn?: string | number;
}

function signWith(secret: string, payload: Partial<TokenPayload>, options: SignTokenOptions = {}): string {
  const expiresIn = options.expiresIn;
  return jwt.sign(
    { ...payload, tokenCreatedAt: new Date().toISOString() } as object,
    secret,
    { expiresIn } as jwt.SignOptions
  );
}

export function signAccessToken(
  payload: Omit<Partial<TokenPayload>, 'type'>,
  options: SignTokenOptions = {}
): string {
  return signWith(JWT_SECRET, { ...payload, type: 'access' }, { expiresIn: options.expiresIn || ACCESS_EXPIRES_IN });
}

export function signRefreshToken(
  payload: Omit<Partial<TokenPayload>, 'type'>,
  options: SignTokenOptions = {}
): string {
  return signWith(
    JWT_REFRESH_SECRET,
    { ...payload, type: 'refresh' },
    { expiresIn: options.expiresIn || REFRESH_EXPIRES_IN }
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
