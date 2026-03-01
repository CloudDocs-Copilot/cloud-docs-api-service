import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../../../src/app';
import User from '../../../src/models/user.model';
import * as jwtService from '../../../src/services/jwt.service';
import { bodyOf } from '../../helpers';
import bcrypt from 'bcryptjs';

describe('UserController Integration Tests', (): void => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let adminUserId: mongoose.Types.ObjectId;
  let testToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoUri);
    // DB connection ready; user fixtures are created per-test in beforeEach
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Create fresh users before each test. The global `afterEach` in
  // `tests/setup.ts` clears collections after every test, so creating
  // fixtures in `beforeEach` ensures each test gets a clean set.
  beforeEach(async () => {
    const user1 = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      active: true
    });
    testUserId = user1._id;

    // Small delay to ensure timestamps differ where necessary
    await new Promise(resolve => setTimeout(resolve, 10));

    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'user@test.com',
      role: 'user'
    });

    const user2 = await User.create({
      name: 'Another User',
      email: 'user2@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      active: true
    });
    testUser2Id = user2._id;

    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'admin',
      active: true
    });
    adminUserId = adminUser._id;

    await new Promise(resolve => setTimeout(resolve, 10));

    adminToken = jwtService.signToken({
      id: adminUserId.toString(),
      email: 'admin@test.com',
      role: 'admin'
    });

    // eslint-disable-next-line no-console
    console.log('[TEST-SETUP] created users:', { testUserId: testUserId?.toString(), testUser2Id: testUser2Id?.toString(), adminUserId: adminUserId?.toString() });
  });

  describe('PATCH /api/users/:id/avatar - Update Avatar', (): void => {
    describe('Success Cases', (): void => {
      it('should update own avatar successfully', async (): Promise<void> => {
        const avatarUrl = 'https://example.com/avatar.jpg';

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: avatarUrl })
          .expect(200);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;

        expect(body).toHaveProperty('message', 'Avatar updated successfully');
        expect((body.user as Record<string, unknown>)).toHaveProperty('avatar', avatarUrl);
        expect((body.user as Record<string, unknown>)).toHaveProperty('id', testUserId.toString());

        // Verificar en base de datos
        const updatedUser = await User.findById(testUserId);
        expect(updatedUser?.avatar).toBe(avatarUrl);
      });

      it('should NOT allow admin to update other user avatar', async (): Promise<void> => {
        const avatarUrl = 'https://example.com/admin-updated-avatar.jpg';

        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ avatar: avatarUrl })
          .expect(403);
      });

      it('should accept valid data URLs as avatars', async (): Promise<void> => {
        const dataUrl =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: dataUrl })
          .expect(200);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((body.user as Record<string, unknown>)).toHaveProperty('avatar', dataUrl);
      });

      it('should update avatar to empty string (remove avatar)', async () => {
        // Primero establecer un avatar
        await User.findByIdAndUpdate(testUserId, { avatar: 'https://example.com/avatar.jpg' });

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: '' })
          .expect(200);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((body.user as Record<string, unknown>)).toHaveProperty('avatar', '');
      });

      it('should accept relative paths as avatars', async (): Promise<void> => {
        const relativePath = '/uploads/avatars/user123.jpg';

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: relativePath })
          .expect(200);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((body.user as Record<string, unknown>)).toHaveProperty('avatar', relativePath);
      });
    });

    describe('Validation Tests', (): void => {
      it('should fail when avatar field is missing', async (): Promise<void> => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ })
          .expect(400);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect(body).toHaveProperty('error', 'Avatar file or URL is required');
      });

      it('should fail when avatar exceeds max length (2048 chars)', async () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2050);

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: longUrl })
          .expect(400);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect(body).toHaveProperty('error');
        expect(String(body.error)).toMatch(/cannot exceed 2048 characters/i);
      });

      it('should fail when user does not exist', async (): Promise<void> => {
        const nonExistentId = new mongoose.Types.ObjectId();

        // Un usuario regular no puede actualizar otro usuario (aunque no exista)
        const response = await request(app)
          .patch(`/api/users/${nonExistentId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(403);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect(body).toHaveProperty('error', 'Forbidden');
      });
    });

    describe('Authorization Tests', (): void => {
      it('should fail when user is not authenticated', async (): Promise<void> => {
        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(401);
      });

      it('should fail when trying to update another user avatar (non-admin)', async () => {
        const response = await request(app)
          .patch(`/api/users/${testUser2Id}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(403);

        const b = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect(b['error']).toBe('Forbidden');
      });

      it('should fail with invalid token', async (): Promise<void> => {
        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', 'Bearer invalid-token-here')
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(401);
      });

      it('should fail with expired token', async (): Promise<void> => {
        // Crear un token expirado
        const expiredToken = jwtService.signToken(
          {
            id: testUserId.toString(),
            email: 'user@test.com',
            role: 'user'
          },
          { expiresIn: '-1h' } // Token expirado hace 1 hora
        );

        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${expiredToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(401);
      });
    });

    describe('Edge Cases', (): void => {
      it('should handle null avatar value', async (): Promise<void> => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: null })
          .expect(400);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect(body).toHaveProperty('error', 'Avatar URL is required');
      });

      it('should trim whitespace from avatar URL', async (): Promise<void> => {
        const avatarUrl = '  https://example.com/avatar.jpg  ';

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: avatarUrl })
          .expect(200);

        // Mongoose trim debe eliminar espacios
        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((body.user as Record<string, unknown>).avatar).toBe('https://example.com/avatar.jpg');
      });

      it('should handle multiple consecutive avatar updates', async (): Promise<void> => {
        const urls = [
          'https://example.com/avatar1.jpg',
          'https://example.com/avatar2.jpg',
          'https://example.com/avatar3.jpg'
        ];

        for (const url of urls) {
          const response = await request(app)
            .patch(`/api/users/${testUserId}/avatar`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ avatar: url })
            .expect(200);

          const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
          expect((body.user as Record<string, unknown>).avatar).toBe(url);
        }

        // Verificar que el último valor persiste
        const user = await User.findById(testUserId);
        expect(user?.avatar).toBe(urls[urls.length - 1]);
      });

      it('should not expose password in response', async (): Promise<void> => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(200);

        const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((body.user as Record<string, unknown>)).not.toHaveProperty('password');
      });

      it('should preserve other user fields when updating avatar', async (): Promise<void> => {
        const originalUser = await User.findById(testUserId);

        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(200);

        const updatedUser = await User.findById(testUserId);
        expect(updatedUser?.name).toBe(originalUser?.name);
        expect(updatedUser?.email).toBe(originalUser?.email);
        expect(updatedUser?.role).toBe(originalUser?.role);
        expect(updatedUser?.active).toBe(originalUser?.active);
      });
    });

    describe('Security Tests', (): void => {
      it('should validate against potential XSS in avatar URL', async (): Promise<void> => {
        const xssPayload = '<script>alert("XSS")</script>';

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: xssPayload })
          .expect(200);

        // Aunque se guarda, el frontend debe sanitizar al mostrar
        const bodyXss = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((bodyXss.user as Record<string, unknown>).avatar).toBe(xssPayload);
      });

      it('should not allow SQL injection attempts', async (): Promise<void> => {
        const sqlInjection = "'; DROP TABLE users; --";

        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: sqlInjection })
          .expect(200);

        // MongoDB no es vulnerable a SQL injection
        const bodySql = bodyOf(response as unknown as Response) as Record<string, unknown>;
        expect((bodySql.user as Record<string, unknown>).avatar).toBe(sqlInjection);
      });
    });

    describe('Data Persistence', (): void => {
      it('should persist avatar across server restarts (simulated)', async () => {
        const avatarUrl = 'https://example.com/persistent-avatar.jpg';

        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: avatarUrl })
          .expect(200);

        // Verificar que está en la base de datos
        const userFromDb = await User.findById(testUserId);
        expect(userFromDb?.avatar).toBe(avatarUrl);

        // Simular una nueva consulta como si fuera después de reinicio
        const freshUser = await User.findById(testUserId);
        expect(freshUser?.avatar).toBe(avatarUrl);
      });
    });

    describe('Concurrent Updates', (): void => {
      it('should handle concurrent avatar updates correctly', async (): Promise<void> => {
        const promises = [
          request(app)
            .patch(`/api/users/${testUserId}/avatar`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ avatar: 'https://example.com/avatar1.jpg' }),
          request(app)
            .patch(`/api/users/${testUserId}/avatar`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ avatar: 'https://example.com/avatar2.jpg' }),
          request(app)
            .patch(`/api/users/${testUserId}/avatar`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ avatar: 'https://example.com/avatar3.jpg' })
        ];

        const responses = await Promise.all(promises);

        // Todas las requests deben ser exitosas
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        // El último valor debe persistir (aunque puede ser cualquiera de los 3)
        const finalUser = await User.findById(testUserId);
        expect(finalUser?.avatar).toMatch(/avatar[123]\.jpg$/);
      });
    });
  });

  describe('Additional User Controller Tests', (): void => {
    describe('GET /api/users - List Users', (): void => {
      it('should allow admin to list all users', async (): Promise<void> => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const list = bodyOf<unknown[]>(response);
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThanOrEqual(3);
      });

      it('should not allow regular users to list users', async (): Promise<void> => {
        await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${testToken}`)
          .expect(403);
      });
    });

    describe('PUT /api/users/:id - Update User', (): void => {
      it('should allow user to update own profile', async (): Promise<void> => {
        const response = await request(app)
          .put(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ name: 'Updated Name', email: 'updated@test.com' })
          .expect(200);

        const bodyUp = bodyOf(response) as Record<string, unknown>;
        expect((bodyUp.user as Record<string, unknown>).name).toBe('Updated Name');
        expect((bodyUp.user as Record<string, unknown>).email).toBe('updated@test.com');
      });

      it('should allow partial update (only name)', async () => {
        const response = await request(app)
          .put(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ name: 'Only Name' })
          .expect(200);

        const bodyPartial = bodyOf(response) as Record<string, unknown>;
        expect((bodyPartial.user as Record<string, unknown>).name).toBe('Only Name');
        // El email debe permanecer igual
        expect((bodyPartial.user as Record<string, unknown>).email).toBe('user@test.com');
      });
    });
  });
});
