/**
 * Authentication Helper
 * Funciones helper para autenticación en tests
 */

import { request, app } from '../setup';
import { UserBuilder } from '../builders/user.builder';
import Organization from '../../src/models/organization.model';
import mongoose from 'mongoose';

export interface AuthResult {
  token: string;
  cookies: string[];
  userId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  organizationId?: string;
}

/**
 * Crea una organización de prueba para los tests legacy
 */
async function createTestOrganization(): Promise<string> {
  // Crear un owner temporal para la organización
  const tempOwnerId = new mongoose.Types.ObjectId();
  
  const org = await Organization.create({
    name: `Test Org ${Date.now()}`,
    owner: tempOwnerId,
    members: [tempOwnerId]
  });
  
  return org._id.toString();
}

/**
 * Registra un nuevo usuario
 */
export async function registerUser(userData?: {
  name?: string;
  email?: string;
  password?: string;
  organizationId?: string;
}): Promise<any> {
  const user = new UserBuilder()
    .withName(userData?.name || 'Test User')
    .withEmail(userData?.email || `test-${Date.now()}@example.com`)
    .withPassword(userData?.password || 'Test@1234')
    .build();

  // Si no se proporciona organizationId, crear una organización de prueba
  const organizationId = userData?.organizationId || await createTestOrganization();

  const response = await request(app)
    .post('/api/auth/register')
    .send({ ...user, organizationId });

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

  // Extraer cookies de la respuesta
  const cookies: string[] = Array.isArray(response.headers['set-cookie']) 
    ? response.headers['set-cookie'] 
    : response.headers['set-cookie'] 
      ? [response.headers['set-cookie']]
      : [];
  
  // Extraer el token de la cookie
  let token = '';
  if (cookies.length > 0) {
    const tokenCookie = cookies.find((cookie: string) => cookie.startsWith('token='));
    if (tokenCookie) {
      token = tokenCookie.split(';')[0].split('=')[1];
    }
  }

  return {
    token,
    cookies,
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
  organizationId?: string;
}): Promise<AuthResult> {
  const user = new UserBuilder()
    .withName(userData?.name || 'Test User')
    .withUniqueEmail(userData?.email?.split('@')[0] || 'test')
    .withPassword(userData?.password || 'Test@1234')
    .build();

  // Si no se proporciona organizationId, crear una organización de prueba
  const organizationId = userData?.organizationId || await createTestOrganization();

  // Registrar
  await request(app)
    .post('/api/auth/register')
    .send({ ...user, organizationId });

  // Login
  const authResult = await loginUser(user.email, user.password);
  authResult.organizationId = organizationId;
  
  return authResult;
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
 * @deprecated Usar cookies directamente en los requests
 */
export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`
  };
}

/**
 * Obtiene la cookie de autenticación formateada para requests
 */
export function getAuthCookie(cookies: string[]): string {
  if (cookies.length === 0) return '';
  
  const tokenCookie = cookies.find((cookie: string) => cookie.startsWith('token='));
  if (!tokenCookie) return '';
  
  return tokenCookie.split(';')[0];
}

/**
 * Verifica si un token es válido usando cookies
 */
export async function verifyToken(cookies: string[]): Promise<boolean> {
  try {
    const response = await request(app)
      .get('/api/documents')
      .set('Cookie', getAuthCookie(cookies));

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
 * Obtiene las cookies de autenticación para tests
 * Registra y autentica un usuario por defecto
 */
export async function getAuthCookies(): Promise<string[]> {
  const { cookies } = await registerAndLogin();
  return cookies;
}

/**
 * Intenta autenticar con credenciales incorrectas
 */
export async function attemptInvalidLogin(email: string, password: string): Promise<any> {
  return await request(app)
    .post('/api/auth/login')
    .send({ email, password });
}
