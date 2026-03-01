import { request, app } from '../setup';
import { bodyOf } from '../helpers';
import type { Response } from 'supertest';
import { UserBuilder } from '../builders/user.builder';
import Organization from '../../src/models/organization.model';
import User from '../../src/models/user.model'; // Importar modelo para verificaciones directas
import mongoose from 'mongoose';

/**
 * Tests de integración para gestión de perfil de usuario
 */
describe('User Profile Management', (): void => {
  let token: string;
  let userId: string;
  let organizationId: string;

  // Helpers to extract token from cookies (safely narrow header types)
  const getTokenFromCookie = (res: Response): string | null => {
    const raw = res.headers['set-cookie'];
    if (!raw) return null;

    const cookies: string[] = Array.isArray(raw) ? raw.map(String) : [String(raw)];

    const tokenCookie = cookies.find((c) => typeof c === 'string' && c.startsWith('token='));
    if (!tokenCookie) return null;

    const firstPart = tokenCookie.split(';')[0];
    const kv = firstPart.split('=');
    return kv.length > 1 ? kv[1] : null;
  };

  beforeEach(async () => {
    // 1. Crear organización válida (requerido por el registro)
    const org = await Organization.create({
      name: `Test Org ${Date.now()}`,
      owner: new mongoose.Types.ObjectId(), // Placeholder
      active: true,
      settings: { maxUsers: 10 }
    });
    organizationId = org._id.toString();

    // 2. Crear datos de usuario asociados a esa organización
    const userData = new UserBuilder()
      .withUniqueEmail('profile-test')
      .withStrongPassword()
      .withOrganizationId(organizationId)
      .build();

    // 3. Registrar usuario
    const registerResponse = await request(app).post('/api/auth/register').send(userData);

    // En algunos casos register devuelve user, en otros _id
    const regBody = bodyOf(registerResponse as unknown as Response) as Record<string, unknown>;
    const regUser = regBody['user'] as Record<string, unknown>;
    userId = (regUser['id'] as string) || (regUser['_id'] as string);

    // 4. Login para obtener token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: userData.email, password: userData.password });

    // Extraer token (puede venir en body O en cookie, testea ambos)
    const loginBody = bodyOf(loginResponse as unknown as Response) as Record<string, unknown>;
    const maybeToken = (loginBody['token'] as string) || getTokenFromCookie(loginResponse as Response);
    if (!maybeToken) throw new Error('Login failed to provide token');
    token = maybeToken;
  });

  describe('PUT /api/users/:id - Update Profile & Preferences', (): void => {
    it('should update user preferences (partial update)', async () => {
      const updateData = {
        preferences: {
          emailNotifications: false,
          aiAnalysis: true
        }
      };

      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData)
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      const user = body['user'] as Record<string, unknown>;
      const preferences = (user['preferences'] as Record<string, unknown>) || {};

      expect(preferences['emailNotifications']).toBe(false);
      expect(preferences['aiAnalysis']).toBe(true);
      // Las preferencias no enviadas deben mantener su valor por defecto (true)
      expect(preferences['documentUpdates']).toBe(true);

      // Verificación directa con Mongoose (Base de datos real)
      const userInDb = await User.findById(userId);
      expect(userInDb).toBeDefined();
      expect(userInDb!.preferences.emailNotifications).toBe(false);
      expect(userInDb!.preferences.aiAnalysis).toBe(true);
    });

    it('should update user profile info without affecting preferences', async (): Promise<void> => {
      const newName = 'Updated Name';
      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: newName }) // No enviamos preferences
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      const user = body['user'] as Record<string, unknown>;

      expect(user['name']).toBe(newName);
      // Preferencias deben seguir existiendo (default true)
      if (user['preferences']) {
        const preferences = user['preferences'] as Record<string, unknown>;
        expect(preferences['documentUpdates']).toBe(true);
      }
    });
  });

  describe('PATCH /api/users/:id/avatar - Avatar Upload', (): void => {
    it('should accept an avatar URL via JSON', async (): Promise<void> => {
      const avatarUrl = 'https://example.com/avatar.jpg';

      const response = await request(app)
        .patch(`/api/users/${userId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .send({ avatar: avatarUrl })
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      const user = body['user'] as Record<string, unknown>;
      expect(user['avatar']).toBe(avatarUrl);
    });

    it('should accept an image file via multipart/form-data', async (): Promise<void> => {
      const buffer = Buffer.from('fake image content');

      const response = await request(app)
        .patch(`/api/users/${userId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', buffer, 'test-avatar.png')
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      const user = body['user'] as Record<string, unknown>;
      expect(user['avatar']).toMatch(/\/uploads\/.*\.png$/);
    });
  });

  describe('DELETE /api/users/me - Danger Zone', (): void => {
    it('should allow user to delete their own account', async (): Promise<void> => {
      // Create user to delete first, to avoid breaking other tests if shared state (though beforeEach handles this)
      await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Intentar acceder de nuevo
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(res => {
          if (res.status !== 401 && res.status !== 404) {
            throw new Error(`Expected 401 or 404, got ${res.status}`);
          }
        });

      // Verificación directa con Mongoose: El usuario ya no debe existir en la BD
      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });
  });

  // Small delay after each test to allow background async jobs/logs to settle
  // Prevents "Cannot log after tests are done" when other modules emit logs
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });
});
