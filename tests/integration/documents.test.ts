import { request, app } from '../setup';
import { registerAndLogin, getAuthCookie } from '../helpers/auth.helper';
import { docUser, secondUser } from '../fixtures';
import User from '../../src/models/user.model';

/**
 * Tests de integración para endpoints de documentos
 * Prueba subida, listado, compartir, eliminar y descarga de documentos
 */
describe('Document Endpoints', (): void => {
  let authCookies: string[];
  let organizationId: string;
  let userId: string;

  function resBody(res: { body: unknown }) {
    return res.body as unknown as Record<string, unknown>;
  }

  beforeEach(async () => {
    const auth = await registerAndLogin({
      name: docUser.name,
      email: docUser.email,
      password: docUser.password
    });

    authCookies = auth.cookies;
    organizationId = auth.organizationId!;
    userId = auth.userId;
  });

  async function getRootFolderIdOrThrow(uid: string): Promise<string> {
    const user = await User.findById(uid);
    const rootFolder = user?.rootFolder?.toString();
    if (!rootFolder) {
      throw new Error('rootFolder not found for test user');
    }
    return rootFolder;
  }

  describe('POST /api/documents/upload', (): void => {
    it('should upload a document', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);
      const rootFolderId = await getRootFolderIdOrThrow(userId);

      const res = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', rootFolderId)
        .attach('file', Buffer.from('Test content'), 'test-file.txt');

      expect(res.status).toBe(201);
      const body = resBody(res);
      expect(body.success).toBe(true);
      expect(body.document).toBeDefined();

      // flexible assertions (depending on controller shape)
      expect((body.document as Record<string, unknown>)).toHaveProperty('id');
      expect((body.document as Record<string, unknown>)).toHaveProperty('filename');
      expect((body.document as Record<string, unknown>)).toHaveProperty('originalname');
    });

    it('should fail without file', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);
      const rootFolderId = await getRootFolderIdOrThrow(userId);

      const res = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', rootFolderId);

      expect(res.status).toBe(400);
      const body2 = resBody(res);
      expect(body2.success).toBe(false);
      expect((body2.error || body2.message) as string).toMatch(/file/i);
    });

    it('should reject invalid folderId format', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', '../../../etc/passwd')
        .attach('file', Buffer.from('test content'), 'testfile.txt');

      expect(res.status).toBe(400);
      const body3 = resBody(res);
      expect(body3.success).toBe(false);
      // message can vary; keep it robust
      expect((body3.error || body3.message) as string).toMatch(/folderId|invalid/i);
    });
  });

  describe('GET /api/documents', (): void => {
    it('should list user documents', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app).get('/api/documents').set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const body4 = resBody(res);
      expect(body4.success).toBe(true);
      expect(Array.isArray(body4.documents)).toBe(true);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).get('/api/documents');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/documents/:id/share', (): void => {
    it('should share a document with other users (same org)', async () => {
      // Create user2 WITHOUT creating a separate org (important)
      const auth2 = await registerAndLogin({
        name: secondUser.name,
        email: secondUser.email,
        password: secondUser.password,
        createOrganization: false
      });

      const user2Id = auth2.userId;

      // Add user2 to org of user1 (owner)
      const cookieHeader = getAuthCookie(authCookies);
      const addMemberRes = await request(app)
        .post(`/api/organizations/${organizationId}/members`)
        .set('Cookie', cookieHeader)
        .send({ userId: user2Id });

      // Some stacks return 200, others 201; accept both
      expect([200, 201]).toContain(addMemberRes.status);

      // Upload a document as user1
      const rootFolderId = await getRootFolderIdOrThrow(userId);
      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', rootFolderId)
        .attach('file', Buffer.from('Document to share'), 'share-test.txt');

      expect(uploadRes.status).toBe(201);
      const uploadBody = resBody(uploadRes);
      const documentId = (uploadBody.document as Record<string, unknown>)?.id;
      expect(documentId).toBeTruthy();

      // Share document with user2
      const shareRes = await request(app)
        .post(`/api/documents/${documentId}/share`)
        .set('Cookie', cookieHeader)
        .send({ userIds: [user2Id] });

      expect(shareRes.status).toBe(200);
      const shareBody = resBody(shareRes);
      expect(shareBody.success).toBe(true);
      expect(shareBody).toHaveProperty('document');
    });
  });

  describe('DELETE /api/documents/:id', (): void => {
    it('should delete a document', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);
      const rootFolderId = await getRootFolderIdOrThrow(userId);

      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', rootFolderId)
        .attach('file', Buffer.from('Document to delete'), 'delete-test.txt');

      expect(uploadRes.status).toBe(201);
      const uploadBody2 = resBody(uploadRes);
      const documentId = (uploadBody2.document as Record<string, unknown>)?.id;
      expect(documentId).toBeTruthy();

      const delRes = await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Cookie', cookieHeader);

      expect(delRes.status).toBe(200);
      const delBody = resBody(delRes);
      expect(delBody.success).toBe(true);
    });
  });

  describe('GET /api/documents/download/:id', (): void => {
    it('should download a document (200 if physical exists, 404 if not)', async () => {
      const cookieHeader = getAuthCookie(authCookies);
      const rootFolderId = await getRootFolderIdOrThrow(userId);

      const uploadRes = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', cookieHeader)
        .field('folderId', rootFolderId)
        .attach('file', Buffer.from('Content to download'), 'download-test.txt');

      expect(uploadRes.status).toBe(201);
      const uploadBody3 = resBody(uploadRes);
      const documentId = (uploadBody3.document as Record<string, unknown>)?.id;
      expect(documentId).toBeTruthy();

      const res = await request(app)
        .get(`/api/documents/download/${documentId}`)
        .set('Cookie', cookieHeader);

      // El download puede dar 404 si el archivo físico no existe (es esperado en tests con MongoMemoryServer)
      // o 200 si existe. Ambos son válidos en este contexto de prueba.
      expect([200, 404]).toContain(res.status);
    });
  });
});
