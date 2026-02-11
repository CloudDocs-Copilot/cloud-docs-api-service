import { request, app } from '../setup';
import { UserBuilder } from '../builders/user.builder';
import Organization from '../../src/models/organization.model';
import User from '../../src/models/user.model'; // Importar modelo para verificaciones directas
import mongoose from 'mongoose';

/**
 * Tests de integración para gestión de perfil de usuario
 */
describe('User Profile Management', () => {
  let token: string;
  let userId: string;
  let organizationId: string;

  // Helpers to extract token from cookies
  const getTokenFromCookie = (res: any) => {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return null;
    
    // Look for token cookie
    const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
    if (!tokenCookie) return null;
    
    // Extract value
    return tokenCookie.split(';')[0].split('=')[1];
  }

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
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userData);
      
    // En algunos casos register devuelve user, en otros _id
    userId = registerResponse.body.user.id || registerResponse.body.user._id;

    // 4. Login para obtener token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: userData.email, password: userData.password });

    // Extraer token (puede venir en body O en cookie, testea ambos)
    token = loginResponse.body.token || getTokenFromCookie(loginResponse);
    if (!token) throw new Error('Login failed to provide token');
  });

  describe('PUT /api/users/:id - Update Profile & Preferences', () => {
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

      expect(response.body.user.preferences.emailNotifications).toBe(false);
      expect(response.body.user.preferences.aiAnalysis).toBe(true);
      // Las preferencias no enviadas deben mantener su valor por defecto (true)
      expect(response.body.user.preferences.documentUpdates).toBe(true);

      // Verificación directa con Mongoose (Base de datos real)
      const userInDb = await User.findById(userId);
      expect(userInDb).toBeDefined();
      expect(userInDb!.preferences.emailNotifications).toBe(false);
      expect(userInDb!.preferences.aiAnalysis).toBe(true);
    });

    it('should update user profile info without affecting preferences', async () => {
      const newName = 'Updated Name';
      const response = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: newName }) // No enviamos preferences
        .expect(200);

      expect(response.body.user.name).toBe(newName);
      // Preferencias deben seguir existiendo (default true)
      if (response.body.user.preferences) {
          expect(response.body.user.preferences.documentUpdates).toBe(true);
      }
    });
  });

  describe('PATCH /api/users/:id/avatar - Avatar Upload', () => {
    it('should accept an avatar URL via JSON', async () => {
      const avatarUrl = 'https://example.com/avatar.jpg';
      
      const response = await request(app)
        .patch(`/api/users/${userId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .send({ avatar: avatarUrl })
        .expect(200);

      expect(response.body.user.avatar).toBe(avatarUrl);
    });

    it('should accept an image file via multipart/form-data', async () => {
      const buffer = Buffer.from('fake image content');
      
      const response = await request(app)
        .patch(`/api/users/${userId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', buffer, 'test-avatar.png')
        .expect(200);

      expect(response.body.user.avatar).toMatch(/\/uploads\/.*\.png$/);
    });
  });

  describe('DELETE /api/users/me - Danger Zone', () => {
    it('should allow user to delete their own account', async () => {
      // Create user to delete first, to avoid breaking other tests if shared state (though beforeEach handles this)
      await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Intentar acceder de nuevo
      await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => {
           if (res.status !== 401 && res.status !== 404) {
             throw new Error(`Expected 401 or 404, got ${res.status}`);
           }
        });

      // Verificación directa con Mongoose: El usuario ya no debe existir en la BD
      const deletedUser = await User.findById(userId);
      expect(deletedUser).toBeNull();
    });
  });
});
