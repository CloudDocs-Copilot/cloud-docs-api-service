import { request, app } from '../setup';
import { registerAndLogin, uploadTestFile } from '../helpers';
import { docUser, secondUser } from '../fixtures';

/**
 * Tests de integración para endpoints de documentos
 * Prueba subida, listado, compartir, eliminar y descarga de documentos
 */
describe('Document Endpoints', () => {
  let authToken: string;

  beforeEach(async () => {
    const { token } = await registerAndLogin({
      name: docUser.name,
      email: docUser.email,
      password: docUser.password
    });
    authToken = token;
  });

  describe('POST /api/documents/upload', () => {
    it('should upload a document', async () => {
      const response = await uploadTestFile(authToken, {
        filename: 'test-file.txt',
        content: 'Test content'
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('originalname');
    });

    it('should fail without file', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/documents', () => {
    it('should list user documents', async () => {
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get('/api/documents')
        .expect(401);
    });
  });

  describe('POST /api/documents/:id/share', () => {
    it('should share a document with other users', async () => {
      // Create another user
      const { userId: user2Id } = await registerAndLogin({
        name: secondUser.name,
        email: secondUser.email,
        password: secondUser.password
      });

      // Upload a document
      const uploadResponse = await uploadTestFile(authToken, {
        filename: 'share-test.txt',
        content: 'Document to share'
      });

      const documentId = uploadResponse.body.id;

      // Share document
      const response = await request(app)
        .post(`/api/documents/${documentId}/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [user2Id] })
        .expect(200);

      expect(response.body).toHaveProperty('doc');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should delete a document', async () => {
      // Upload a document first
      const uploadResponse = await uploadTestFile(authToken, {
        filename: 'delete-test.txt',
        content: 'Document to delete'
      });

      const documentId = uploadResponse.body.id;

      await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  describe('GET /api/documents/download/:id', () => {
    it('should download a document', async () => {
      // Upload a document first
      const uploadResponse = await uploadTestFile(authToken, {
        filename: 'download-test.txt',
        content: 'Content to download'
      });

      const documentId = uploadResponse.body.id;

      const response = await request(app)
        .get(`/api/documents/download/${documentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify content is received
      expect(response.body).toBeDefined();
    });
  });
});
