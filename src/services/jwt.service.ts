import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_dev';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

/**
 * Estructura del payload del token JWT
 */
export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  tokenVersion?: number;
  tokenCreatedAt?: string;
}

/**
 * Opciones para la firma del token
 */
export interface SignTokenOptions {
  expiresIn?: string | number;
}

/**
 * Firma un token JWT con el payload proporcionado
 *
 * @param payload - Datos a incluir en el token
 * @param options - Opciones de configuración (tiempo de expiración)
 * @returns Token JWT firmado
 */
export function signToken(payload: Partial<TokenPayload>, options: SignTokenOptions = {}): string {
  const expiresIn: string | number = options.expiresIn || JWT_EXPIRES_IN;
  return jwt.sign({ ...payload, tokenCreatedAt: new Date().toISOString() } as object, JWT_SECRET, {
    expiresIn
  } as jwt.SignOptions);
}

/**
 * Verifica y decodifica un token JWT
 *
 * @param token - Token JWT a verificar
 * @returns Payload decodificado del token
 * @throws Error si el token es inválido o ha expirado
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export default {
  signToken,
  verifyToken
};
