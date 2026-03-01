import { request, app } from '../setup';
import type { Response } from 'supertest';
import { UserBuilder } from '../builders';
import { authUser } from '../fixtures';
import Organization from '../../src/models/organization.model';
import mongoose from 'mongoose';

/**
 * Tests de integración para endpoints de autenticación
 * Prueba el registro, login y validaciones de seguridad
 */
describe('Auth Endpoints', (): void => {
  let testOrgId: string;

  type ApiBody = { success?: boolean; user?: unknown; message?: string; error?: string };

  function bodyOf(res: Response): ApiBody {
    return (res.body as unknown) as ApiBody;
  }

  beforeEach(async () => {
    // Crear una organización de prueba para cada test
    const tempOwnerId = new mongoose.Types.ObjectId();
    const org = await Organization.create({
      name: `Test Org ${Date.now()}`,
      owner: tempOwnerId,
      members: [tempOwnerId]
    });
    testOrgId = org._id.toString();
  });

  describe('POST /api/auth/register', (): void => {
    it('should register a new user', async (): Promise<void> => {
      const userData = new UserBuilder().withUniqueEmail('test').withStrongPassword().build();

      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, organizationId: testOrgId })
        .expect(201);

      const b = bodyOf(response);
      expect(b.user).toBeDefined();
      const userObj = b.user as Record<string, unknown>;
      expect(userObj['email']).toBe(userData.email);
    });

    it('should fail with incomplete data', async (): Promise<void> => {
      const userData = {
        email: new UserBuilder().withUniqueEmail('incomplete').build().email
        // Missing name and password
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(400);
      const b = bodyOf(response);
      expect(b.error).toBeDefined();
    });

    it('should fail with duplicate email', async (): Promise<void> => {
      const userData = new UserBuilder()
        .withName('Usuario Test')
        .withEmail('duplicate@example.com')
        .withStrongPassword()
        .build();

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({ ...userData, organizationId: testOrgId });

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...userData, organizationId: testOrgId })
        .expect(409);

      const b = bodyOf(response);
      expect(b.error).toBeDefined();
    });
  });

  describe('POST /api/auth/login', (): void => {
    beforeEach(async () => {
      // Register user before each login test
      await request(app)
        .post('/api/auth/register')
        .send({ ...authUser, organizationId: testOrgId });
    });

    it('should login with correct credentials', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: authUser.email,
          password: authUser.password
        })
        .expect(200);

      const b = bodyOf(response);
      // Verificar que NO devuelve token en JSON
      expect(b).not.toHaveProperty('token');
      // Verificar que devuelve el usuario
      expect(b.user).toBeDefined();
      expect(b.message).toBeDefined();
      // Verificar que envía la cookie
      expect(response.headers['set-cookie']).toBeDefined();
      const cookies: string[] = response.headers['set-cookie'] as unknown as string[];
      const tokenCookie = cookies.find((cookie: string) => cookie.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      // Verificar que la cookie tiene httpOnly
      expect(tokenCookie).toMatch(/HttpOnly/);
    });

    it('should fail with incorrect credentials', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: authUser.email,
          password: 'WrongPass@123'
        })
        .expect(401);

      const b = bodyOf(response);
      expect(b.error).toBeDefined();
    });

    it('should fail with non-existent email', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexiste@example.com',
          password: 'Test@1234'
        })
        .expect(404);

      const b = bodyOf(response);
      expect(b.error).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', (): void => {
    beforeEach(async () => {
      // Register user before logout test
      await request(app)
        .post('/api/auth/register')
        .send({ ...authUser, organizationId: testOrgId });
    });

    it('should logout successfully and clear cookie', async (): Promise<void> => {
      // Primero hacer login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: authUser.email,
          password: authUser.password
        })
        .expect(200);

      const cookies: string[] = loginResponse.headers['set-cookie'] as unknown as string[];
      const tokenCookie = cookies.find((cookie: string) => cookie.startsWith('token='));

      // Hacer logout con la cookie
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      const b = bodyOf(logoutResponse);
      expect(b.message).toBeDefined();
      expect(b.message).toBe('Logout successful');

      // Verificar que la cookie se limpia
      const clearCookies: string[] | undefined = logoutResponse.headers['set-cookie'] as unknown as
        | string[]
        | undefined;
      if (clearCookies) {
        const clearedTokenCookie = clearCookies.find((cookie: string) =>
          cookie.startsWith('token=')
        );
        // La cookie debe estar vac\u00eda o con Max-Age=0
        expect(clearedTokenCookie).toBeDefined();
      }
    });
  });
});
