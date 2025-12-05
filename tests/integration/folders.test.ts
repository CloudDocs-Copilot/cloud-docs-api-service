import { request, app } from '../setup';

describe('Folder Endpoints', () => {
  let authToken: string;
  let userId: string;

  // Registrar y autenticar usuario antes de los tests
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Usuario Test',
        email: 'folder-test@example.com',
        password: 'password123'
      });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'folder-test@example.com',
        password: 'password123'
      });

    authToken = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  describe('POST /api/folders', () => {
    it('debería crear una nueva carpeta', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Mi Carpeta' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Mi Carpeta');
      expect(response.body.owner).toBe(userId);
    });

    it('debería fallar sin token de autenticación', async () => {
      const response = await request(app)
        .post('/api/folders')
        .send({ name: 'Mi Carpeta' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('debería fallar con nombre duplicado para el mismo usuario', async () => {
      // Crear primera carpeta
      await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Duplicada' });

      // Intentar crear carpeta con el mismo nombre
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Duplicada' })
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/folders', () => {
    it('debería listar las carpetas del usuario', async () => {
      // Crear algunas carpetas
      await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Carpeta 1' });

      await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Carpeta 2' });

      const response = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('debería fallar sin autenticación', async () => {
      await request(app)
        .get('/api/folders')
        .expect(401);
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('debería eliminar una carpeta vacía', async () => {
      const createResponse = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'A Eliminar' });

      const folderId = createResponse.body.id;

      await request(app)
        .delete(`/api/folders/${folderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('debería fallar al eliminar carpeta con documentos sin force', async () => {
      // Este test requeriría crear documentos en la carpeta primero
      // Se deja como esqueleto para implementación futura
    });
  });

  describe('PATCH /api/folders/:id', () => {
    it('debería renombrar una carpeta', async () => {
      const createResponse = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Nombre Original' });

      const folderId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/folders/${folderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Nuevo Nombre' })
        .expect(200);

      expect(response.body.name).toBe('Nuevo Nombre');
    });

    it('debería fallar sin autenticación', async () => {
      await request(app)
        .patch('/api/folders/123456')
        .send({ name: 'Nuevo Nombre' })
        .expect(401);
    });
  });
});
