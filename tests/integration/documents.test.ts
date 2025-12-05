import { request, app } from '../setup';
import path from 'path';
import fs from 'fs';

describe('Document Endpoints', () => {
  let authToken: string;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Usuario Test',
        email: 'doc-test@example.com',
        password: 'password123'
      });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'doc-test@example.com',
        password: 'password123'
      });

    authToken = loginResponse.body.token;
  });

  describe('POST /api/documents/upload', () => {
    it('debería subir un documento', async () => {
      // Crear un archivo temporal para el test
      const testFilePath = path.join(__dirname, 'test-file.txt');
      fs.writeFileSync(testFilePath, 'Contenido de prueba');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('originalname');

      // Limpiar archivo temporal
      fs.unlinkSync(testFilePath);
    });

    it('debería fallar sin archivo', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/documents', () => {
    it('debería listar los documentos del usuario', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('debería fallar sin autenticación', async () => {
      await request(app)
        .get('/api/documents')
        .expect(401);
    });
  });

  describe('POST /api/documents/:id/share', () => {
    it('debería compartir un documento con otros usuarios', async () => {
      // Crear otro usuario
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Usuario 2',
          email: 'user2@example.com',
          password: 'password123'
        });

      const user2LoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user2@example.com',
          password: 'password123'
        });

      const user2Id = user2LoginResponse.body.user.id;

      // Subir un documento
      const testFilePath = path.join(__dirname, 'share-test.txt');
      fs.writeFileSync(testFilePath, 'Documento para compartir');

      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const documentId = uploadResponse.body.id;

      // Compartir documento
      const response = await request(app)
        .post(`/api/documents/${documentId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [user2Id] })
        .expect(200);

      expect(response.body).toHaveProperty('doc');

      // Limpiar
      fs.unlinkSync(testFilePath);
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('debería eliminar un documento', async () => {
      // Subir un documento primero
      const testFilePath = path.join(__dirname, 'delete-test.txt');
      fs.writeFileSync(testFilePath, 'Documento a eliminar');

      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const documentId = uploadResponse.body.id;

      await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Limpiar
      fs.unlinkSync(testFilePath);
    });
  });

  describe('GET /api/documents/download/:id', () => {
    it('debería descargar un documento', async () => {
      // Subir un documento primero
      const testFilePath = path.join(__dirname, 'download-test.txt');
      const testContent = 'Contenido para descargar';
      fs.writeFileSync(testFilePath, testContent);

      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath);

      const documentId = uploadResponse.body.id;

      const response = await request(app)
        .get(`/api/documents/download/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verificar que se recibe contenido
      expect(response.body).toBeDefined();

      // Limpiar
      fs.unlinkSync(testFilePath);
    });
  });
});
