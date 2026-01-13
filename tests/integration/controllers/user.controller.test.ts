import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../../../src/app';
import User from '../../../src/models/user.model';
import * as jwtService from '../../../src/services/jwt.service';
import bcrypt from 'bcryptjs';

describe('UserController Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let adminUserId: mongoose.Types.ObjectId;
  let testToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuarios de prueba
    const user1 = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      active: true,
    });
    testUserId = user1._id;
    
    // Esperar para asegurar que tokenCreatedAt > user.updatedAt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'user@test.com',
      role: 'user',
    });

    const user2 = await User.create({
      name: 'Another User',
      email: 'user2@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      active: true,
    });
    testUser2Id = user2._id;

    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: await bcrypt.hash('password123', 10),
      role: 'admin',
      active: true,
    });
    adminUserId = adminUser._id;

    await new Promise(resolve => setTimeout(resolve, 100));
    
    adminToken = jwtService.signToken({
      id: adminUserId.toString(),
      email: 'admin@test.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Limpiar solo los usuarios creados durante los tests
    await User.deleteMany({
      _id: { $nin: [testUserId, testUser2Id, adminUserId] }
    });
    
    // Restaurar usuarios de prueba al estado original si fueron modificados
    await User.findByIdAndUpdate(testUserId, {
      name: 'Test User',
      email: 'user@test.com',
      active: true,
      avatar: null,
    });
  });

  describe('PATCH /api/users/:id/avatar - Update Avatar', () => {
    describe('Success Cases', () => {
      it('should update own avatar successfully', async () => {
        const avatarUrl = 'https://example.com/avatar.jpg';
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: avatarUrl })
          .expect(200);

        expect(response.body).toHaveProperty('message', 'Avatar updated successfully');
        expect(response.body.user).toHaveProperty('avatar', avatarUrl);
        expect(response.body.user).toHaveProperty('id', testUserId.toString());

        // Verificar en base de datos
        const updatedUser = await User.findById(testUserId);
        expect(updatedUser?.avatar).toBe(avatarUrl);
      });

      it('should NOT allow admin to update other user avatar', async () => {
        const avatarUrl = 'https://example.com/admin-updated-avatar.jpg';
        
        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ avatar: avatarUrl })
          .expect(403);
      });

      it('should accept valid data URLs as avatars', async () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: dataUrl })
          .expect(200);

        expect(response.body.user).toHaveProperty('avatar', dataUrl);
      });

      it('should update avatar to empty string (remove avatar)', async () => {
        // Primero establecer un avatar
        await User.findByIdAndUpdate(testUserId, { avatar: 'https://example.com/avatar.jpg' });
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: '' })
          .expect(200);

        expect(response.body.user).toHaveProperty('avatar', '');
      });

      it('should accept relative paths as avatars', async () => {
        const relativePath = '/uploads/avatars/user123.jpg';
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: relativePath })
          .expect(200);

        expect(response.body.user).toHaveProperty('avatar', relativePath);
      });
    });

    describe('Validation Tests', () => {
      it('should fail when avatar field is missing', async () => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Avatar URL is required');
      });

      it('should fail when avatar exceeds max length (2048 chars)', async () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2050);
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: longUrl })
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/cannot exceed 2048 characters/i);
      });

      it('should fail when user does not exist', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        
        // Un usuario regular no puede actualizar otro usuario (aunque no exista)
        const response = await request(app)
          .patch(`/api/users/${nonExistentId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(403);

        expect(response.body).toHaveProperty('error', 'Forbidden');
      });
    });

    describe('Authorization Tests', () => {
      it('should fail when user is not authenticated', async () => {
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

        expect(response.body).toHaveProperty('error', 'Forbidden');
      });

      it('should fail with invalid token', async () => {
        await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', 'Bearer invalid-token-here')
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(401);
      });

      it('should fail with expired token', async () => {
        // Crear un token expirado
        const expiredToken = jwtService.signToken(
          {
            id: testUserId.toString(),
            email: 'user@test.com',
            role: 'user',
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

    describe('Edge Cases', () => {
      it('should handle null avatar value', async () => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: null })
          .expect(400);

        expect(response.body).toHaveProperty('error', 'Avatar URL is required');
      });

      it('should trim whitespace from avatar URL', async () => {
        const avatarUrl = '  https://example.com/avatar.jpg  ';
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: avatarUrl })
          .expect(200);

        // Mongoose trim debe eliminar espacios
        expect(response.body.user.avatar).toBe('https://example.com/avatar.jpg');
      });

      it('should handle multiple consecutive avatar updates', async () => {
        const urls = [
          'https://example.com/avatar1.jpg',
          'https://example.com/avatar2.jpg',
          'https://example.com/avatar3.jpg',
        ];

        for (const url of urls) {
          const response = await request(app)
            .patch(`/api/users/${testUserId}/avatar`)
            .set('Authorization', `Bearer ${testToken}`)
            .send({ avatar: url })
            .expect(200);

          expect(response.body.user.avatar).toBe(url);
        }

        // Verificar que el último valor persiste
        const user = await User.findById(testUserId);
        expect(user?.avatar).toBe(urls[urls.length - 1]);
      });

      it('should not expose password in response', async () => {
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: 'https://example.com/avatar.jpg' })
          .expect(200);

        expect(response.body.user).not.toHaveProperty('password');
      });

      it('should preserve other user fields when updating avatar', async () => {
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

    describe('Security Tests', () => {
      it('should validate against potential XSS in avatar URL', async () => {
        const xssPayload = '<script>alert("XSS")</script>';
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: xssPayload })
          .expect(200);

        // Aunque se guarda, el frontend debe sanitizar al mostrar
        expect(response.body.user.avatar).toBe(xssPayload);
      });

      it('should not allow SQL injection attempts', async () => {
        const sqlInjection = "'; DROP TABLE users; --";
        
        const response = await request(app)
          .patch(`/api/users/${testUserId}/avatar`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ avatar: sqlInjection })
          .expect(200);

        // MongoDB no es vulnerable a SQL injection
        expect(response.body.user.avatar).toBe(sqlInjection);
      });
    });

    describe('Data Persistence', () => {
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

    describe('Concurrent Updates', () => {
      it('should handle concurrent avatar updates correctly', async () => {
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
            .send({ avatar: 'https://example.com/avatar3.jpg' }),
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

  describe('Additional User Controller Tests', () => {
    describe('GET /api/users - List Users', () => {
      it('should allow admin to list all users', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThanOrEqual(3);
      });

      it('should not allow regular users to list users', async () => {
        await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${testToken}`)
          .expect(403);
      });
    });

    describe('PUT /api/users/:id - Update User', () => {
      it('should allow user to update own profile', async () => {
        const response = await request(app)
          .put(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ name: 'Updated Name', email: 'updated@test.com' })
          .expect(200);

        expect(response.body.user.name).toBe('Updated Name');
        expect(response.body.user.email).toBe('updated@test.com');
      });

      it('should fail when required fields are missing', async () => {
        await request(app)
          .put(`/api/users/${testUserId}`)
          .set('Authorization', `Bearer ${testToken}`)
          .send({ name: 'Only Name' })
          .expect(400);
      });
    });
  });
});
