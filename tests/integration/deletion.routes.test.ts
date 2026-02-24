import request from 'supertest';
import app from '../../src/app';
import DocumentModel from '../../src/models/document.model';
import DeletionAudit from '../../src/models/deletion-audit.model';
import { registerAndLogin, uploadTestFile } from '../helpers';

describe('Deletion Routes', () => {
  let authCookies: string[];
  let userId: string;
  let document: any;

  beforeEach(async () => {
    // Usar helper existente para registrar y hacer login
    const auth = await registerAndLogin({
      name: 'Test User',
      email: 'deletion-test@example.com',
      password: 'TestPass123!'
    });

    authCookies = auth.cookies;
    userId = auth.userId;

    // Subir documento de prueba usando helper existente
    const uploadResponse = await uploadTestFile(authCookies, {
      filename: 'test-deletion.pdf',
      content: 'Test content for deletion'
    });

    document = uploadResponse.body.document;
  });

  describe('POST /api/deletion/:id/trash', () => {
    it('should move document to trash successfully', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ reason: 'Test deletion' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('moved to trash');
      expect(response.body.data.isDeleted).toBe(true);
      expect(response.body.data.deletionReason).toBe('Test deletion');

      // Verificar que se creó el registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: document.id,
        action: 'move_to_trash'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 404 for non-existent document', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      await request(app)
        .post(`/api/deletion/${fakeId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(404);
    });

    it('should return 400 if document already in trash', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover primero a papelera
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      // Intentar mover de nuevo
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('POST /api/deletion/:id/restore', () => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera primero
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should restore document from trash successfully', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .post(`/api/deletion/${document.id}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('restored');
      expect(response.body.data.isDeleted).toBe(false);
      expect(response.body.data.deletedAt).toBeUndefined();

      // Verificar registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: document.id,
        action: 'restore_from_trash'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 400 if document is not in trash', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Restaurar primero
      await request(app)
        .post(`/api/deletion/${document.id}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      // Intentar restaurar de nuevo
      await request(app)
        .post(`/api/deletion/${document.id}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('GET /api/deletion/trash', () => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should return documents in trash', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .get('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].isDeleted).toBe(true);
      expect(response.body.data[0].originalname).toBe('test-deletion.pdf');
    });

    it('should return empty array when trash is empty', async () => {
      // Restaurar documento
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      await request(app)
        .post(`/api/deletion/${document.id}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();

      const response = await request(app)
        .get('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should support pagination', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .get('/api/deletion/trash?page=1&limit=10')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.currentPage).toBe(1);
    });
  });

  describe('DELETE /api/deletion/:id/permanent', () => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera primero
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should permanently delete document', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .delete(`/api/deletion/${document.id}/permanent`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ secureDeleteMethod: 'simple' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('permanently deleted');

      // Verificar que el documento ya no existe
      const deletedDoc = await DocumentModel.findById(document.id);
      expect(deletedDoc).toBeNull();

      // Verificar registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: document.id,
        action: 'permanent_delete'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 400 if document is not in trash', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Restaurar primero
      await request(app)
        .post(`/api/deletion/${document.id}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();

      await request(app)
        .delete(`/api/deletion/${document.id}/permanent`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('DELETE /api/deletion/trash', () => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera
      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should empty trash successfully', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .delete('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ secureDeleteMethod: 'simple' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(1);

      // Verificar que no hay documentos en papelera
      const remainingDocs = await DocumentModel.find({
        uploadedBy: userId,
        isDeleted: true
      });
      expect(remainingDocs).toHaveLength(0);
    });

    it('should return 0 deleted count when trash is empty', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Vaciar papelera primero
      await request(app)
        .delete('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();

      // Intentar vaciar de nuevo
      const response = await request(app)
        .delete('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      expect(response.body.data.deletedCount).toBe(0);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without auth token', async () => {
      await request(app).post(`/api/deletion/${document.id}/trash`).send().expect(401);
    });

    it('should return 403 for unauthorized user', async () => {
      // Create another user with different credentials
      const otherAuth = await registerAndLogin({
        name: 'Other User',
        email: 'other-deletion@example.com',
        password: 'OtherPass123!'
      });

      const otherTokenCookie = otherAuth.cookies.find((cookie: string) =>
        cookie.startsWith('token=')
      );

      await request(app)
        .post(`/api/deletion/${document.id}/trash`)
        .set('Cookie', otherTokenCookie?.split(';')[0] || '')
        .send()
        .expect(403);
    });
  });
});
