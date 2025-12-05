import { request, app } from '../setup';

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('debería registrar un nuevo usuario', async () => {
      const userData = {
        name: 'Usuario Test',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
    });

    it('debería fallar con datos incompletos', async () => {
      const userData = {
        email: 'test@example.com'
        // Falta name y password
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('debería fallar con email duplicado', async () => {
      const userData = {
        name: 'Usuario Test',
        email: 'duplicate@example.com',
        password: 'password123'
      };

      // Primer registro
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Segundo registro con el mismo email
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Registrar usuario antes de cada test de login
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Usuario Test',
          email: 'login@example.com',
          password: 'password123'
        });
    });

    it('debería hacer login con credenciales correctas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('debería fallar con credenciales incorrectas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('debería fallar con email no existente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexiste@example.com',
          password: 'password123'
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });
});
