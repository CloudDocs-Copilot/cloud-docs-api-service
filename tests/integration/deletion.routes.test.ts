import request from 'supertest';
import type { Response } from 'supertest';
import app from '../../src/app';
import DocumentModel from '../../src/models/document.model';
import DeletionAudit from '../../src/models/deletion-audit.model';
import { registerAndLogin, uploadTestFile, bodyOf } from '../helpers';

describe('Deletion Routes', (): void => {
  let authCookies: string[];
  let userId: string;
  let document: Record<string, unknown>;
  let documentId: string;

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

    {
      const b = bodyOf(uploadResponse as unknown as Response) as Record<string, unknown>;
      document = b['document'] as Record<string, unknown>;
      documentId = document['id'] as string;
    }
  });

  

  describe('POST /api/deletion/:id/trash', (): void => {
    it('should move document to trash successfully', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ reason: 'Test deletion' })
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      expect((body['message'] as string)).toContain('moved to trash');
      const data = body['data'] as Record<string, unknown>;
      expect(data['isDeleted']).toBe(true);
      expect(data['deletionReason']).toBe('Test deletion');

      // Verificar que se creó el registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: documentId,
        action: 'move_to_trash'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 404 for non-existent document', async (): Promise<void> => {
      const fakeId = '507f1f77bcf86cd799439011';
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      await request(app)
        .post(`/api/deletion/${fakeId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(404);
    });

    it('should return 400 if document already in trash', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover primero a papelera
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      // Intentar mover de nuevo
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('POST /api/deletion/:id/restore', (): void => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera primero
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should restore document from trash successfully', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .post(`/api/deletion/${documentId}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      expect((body['message'] as string)).toContain('restored');
      const data = body['data'] as Record<string, unknown>;
      expect(data['isDeleted']).toBe(false);
      expect(data['deletedAt']).toBeUndefined();

      // Verificar registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: documentId,
        action: 'restore_from_trash'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 400 if document is not in trash', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Restaurar primero
      await request(app)
        .post(`/api/deletion/${documentId}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(200);

      // Intentar restaurar de nuevo
      await request(app)
        .post(`/api/deletion/${documentId}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('GET /api/deletion/trash', (): void => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should return documents in trash', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .get('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const data = body['data'] as unknown[];
      expect(data).toHaveLength(1);
      const first = data[0] as Record<string, unknown>;
      expect(first['isDeleted']).toBe(true);
      expect(first['originalname']).toBe('test-deletion.pdf');
    });

    it('should return empty array when trash is empty', async (): Promise<void> => {
      // Restaurar documento
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      await request(app)
        .post(`/api/deletion/${documentId}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();

      const response = await request(app)
        .get('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      const b = bodyOf<Record<string, unknown>>(response);
      expect(b['success']).toBe(true);
      expect((b['data'] as unknown[])).toHaveLength(0);
    });

    it('should support pagination', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .get('/api/deletion/trash?page=1&limit=10')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);
      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const pagination = body['pagination'] as Record<string, unknown>;
      expect(pagination).toBeDefined();
      expect((pagination['currentPage'] as number)).toBe(1);
    });
  });

  describe('DELETE /api/deletion/:id/permanent', (): void => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera primero
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should permanently delete document', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .delete(`/api/deletion/${documentId}/permanent`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ secureDeleteMethod: 'simple' })
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      expect((body['message'] as string)).toContain('permanently deleted');

      // Verificar que el documento ya no existe
      const deletedDoc = await DocumentModel.findById(documentId);
      expect(deletedDoc).toBeNull();

      // Verificar registro de auditoría
      const auditRecord = await DeletionAudit.findOne({
        documentId: documentId,
        action: 'permanent_delete'
      });
      expect(auditRecord).not.toBeNull();
    });

    it('should return 400 if document is not in trash', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Restaurar primero
      await request(app)
        .post(`/api/deletion/${documentId}/restore`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();

      await request(app)
        .delete(`/api/deletion/${documentId}/permanent`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send()
        .expect(400);
    });
  });

  describe('DELETE /api/deletion/trash', (): void => {
    beforeEach(async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      // Mover documento a papelera
      await request(app)
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send();
    });

    it('should empty trash successfully', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));

      const response = await request(app)
        .delete('/api/deletion/trash')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ secureDeleteMethod: 'simple' })
        .expect(200);

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const data = body['data'] as Record<string, unknown>;
      expect((data['deletedCount'] as number)).toBe(1);

      // Verificar que no hay documentos en papelera
      const remainingDocs = await DocumentModel.find({
        uploadedBy: userId,
        isDeleted: true
      });
      expect(remainingDocs).toHaveLength(0);
    });

    it('should return 0 deleted count when trash is empty', async (): Promise<void> => {
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

      const body = bodyOf(response as unknown as Response) as Record<string, unknown>;
      const data = body['data'] as Record<string, unknown>;
      expect((data['deletedCount'] as number)).toBe(0);
    });
  });

  describe('Authorization', (): void => {
    it('should return 401 without auth token', async (): Promise<void> => {
      await request(app).post(`/api/deletion/${documentId}/trash`).send().expect(401);
    });

    it('should return 403 for unauthorized user', async (): Promise<void> => {
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
        .post(`/api/deletion/${documentId}/trash`)
        .set('Cookie', otherTokenCookie?.split(';')[0] || '')
        .send()
        .expect(403);
    });
  });
});
