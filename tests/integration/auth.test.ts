import { request, app } from '../setup';
import { UserBuilder } from '../builders';
import { authUser } from '../fixtures';

/**
 * Tests de integración para endpoints de autenticación
 * Prueba el registro, login y validaciones de seguridad
 */
describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = new UserBuilder()
        .withUniqueEmail('test')
        .withStrongPassword()
        .build();

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
    });

    it('should fail with incomplete data', async () => {
      const userData = {
        email: new UserBuilder().withUniqueEmail('incomplete').build().email
        // Missing name and password
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with duplicate email', async () => {
      const userData = new UserBuilder()
        .withName('Usuario Test')
        .withEmail('duplicate@example.com')
        .withStrongPassword()
        .build();

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Second registration with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register user before each login test
      await request(app)
        .post('/api/auth/register')
        .send(authUser);
    });

    it('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: authUser.email,
          password: authUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should fail with incorrect credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: authUser.email,
          password: 'WrongPass@123'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexiste@example.com',
          password: 'Test@1234'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });
});
