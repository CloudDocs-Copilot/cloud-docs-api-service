/**
 * Authentication Helper
 * Funciones helper para autenticación en tests
 */

import { request, app } from '../setup';
import { UserBuilder } from '../builders/user.builder';

export interface AuthResult {
  token: string;
  userId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Registra un nuevo usuario
 */
export async function registerUser(userData?: {
  name?: string;
  email?: string;
  password?: string;
}): Promise<any> {
  const user = new UserBuilder()
    .withName(userData?.name || 'Test User')
    .withEmail(userData?.email || `test-${Date.now()}@example.com`)
    .withPassword(userData?.password || 'Test@1234')
    .build();

  const response = await request(app)
    .post('/api/auth/register')
    .send(user);

  return response;
}

/**
 * Inicia sesión con un usuario
 */
export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    token: response.body.token,
    userId: response.body.user.id,
    user: response.body.user
  };
}

/**
 * Registra y autentica un usuario en un solo paso
 */
export async function registerAndLogin(userData?: {
  name?: string;
  email?: string;
  password?: string;
}): Promise<AuthResult> {
  const user = new UserBuilder()
    .withName(userData?.name || 'Test User')
    .withUniqueEmail(userData?.email?.split('@')[0] || 'test')
    .withPassword(userData?.password || 'Test@1234')
    .build();

  // Registrar
  await request(app)
    .post('/api/auth/register')
    .send(user);

  // Login
  return await loginUser(user.email, user.password);
}

/**
 * Crea múltiples usuarios autenticados
 */
export async function createAuthenticatedUsers(count: number): Promise<AuthResult[]> {
  const results: AuthResult[] = [];

  for (let i = 0; i < count; i++) {
    const authResult = await registerAndLogin({
      name: `User ${i + 1}`,
      email: `user${i + 1}-${Date.now()}@example.com`
    });
    results.push(authResult);
  }

  return results;
}

/**
 * Obtiene headers de autenticación para requests
 */
export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`
  };
}

/**
 * Verifica si un token es válido
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`);

    return response.status !== 401;
  } catch {
    return false;
  }
}

/**
 * Crea un token de autenticación rápido para tests
 * Registra y autentica un usuario por defecto
 */
export async function getAuthToken(): Promise<string> {
  const { token } = await registerAndLogin();
  return token;
}

/**
 * Intenta autenticar con credenciales incorrectas
 */
export async function attemptInvalidLogin(email: string, password: string): Promise<any> {
  return await request(app)
    .post('/api/auth/login')
    .send({ email, password });
}
