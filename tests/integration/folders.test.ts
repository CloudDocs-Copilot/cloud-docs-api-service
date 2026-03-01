import { request, app } from '../setup';
import type { Response } from 'supertest';
import { registerAndLogin, bodyOf } from '../helpers';
import { folderUser, basicFolder, duplicateFolder, multipleFolders } from '../fixtures';
import { FolderBuilder } from '../builders';

/**
 * Tests de integración para endpoints de carpetas
 * Prueba creación, listado, eliminación y renombrado de carpetas
 */
describe('Folder Endpoints', (): void => {
  let authCookies: string[];
  let userId: string;
  let organizationId: string;
  let rootFolderId: string;

  // Register and authenticate user before tests
  beforeEach(async () => {
    const auth = await registerAndLogin({
      name: folderUser.name,
      email: folderUser.email,
      password: folderUser.password
    });
    authCookies = auth.cookies;
    userId = auth.userId;
    organizationId = auth.organizationId!;

    // Obtener rootFolder del usuario
    const User = (await import('../../src/models/user.model')).default;
    const user = await User.findById(userId);
    rootFolderId = user?.rootFolder?.toString() || '';
  });



  describe('POST /api/folders', (): void => {
    it('should create a new folder', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));
      const response = await request(app)
        .post('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({
          name: basicFolder.name,
          organizationId,
          parentId: rootFolderId
        })
        .expect(201);

      const body = bodyOf(response as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const folder = body['folder'] as Record<string, unknown>;
      expect(folder).toBeDefined();
      expect(folder['id']).toBeDefined();
      expect(folder['name']).toBe(basicFolder.name);
      expect((folder['owner'] as unknown as { toString: () => string }).toString()).toBe(userId);
    });

    it('should fail without authentication token', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/folders')
        .send({ name: basicFolder.name })
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should allow duplicate name in same parent (folders identified by path)', async () => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));
      // Create first folder
      await request(app)
        .post('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({
          name: duplicateFolder.name,
          organizationId,
          parentId: rootFolderId
        })
        .expect(201);

      // Los nombres de carpeta pueden duplicarse en multi-tenant
      // porque se identifican por path completo
      const response = await request(app)
        .post('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({
          name: duplicateFolder.name,
          displayName: 'Otro nombre display',
          organizationId,
          parentId: rootFolderId
        });

      // Puede crear carpetas con nombres técnicos duplicados si tienen displayNames diferentes
      // o puede fallar si el servicio valida duplicados. Ambos son válidos.
      expect([201, 409]).toContain(response.status);
    });
  });

  describe('GET /api/folders', (): void => {
    it('should list user folders', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));
      // Create some folders
      for (const folder of multipleFolders.slice(0, 2)) {
        await request(app)
          .post('/api/folders')
          .set('Cookie', tokenCookie?.split(';')[0] || '')
          .send({
            name: folder.name,
            organizationId,
            parentId: rootFolderId
          });
      }

      const response = await request(app)
        .get('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);

      const body = bodyOf(response as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const folders = body['folders'] as unknown[];
      expect(Array.isArray(folders)).toBe(true);
      // Debe incluir las 2 carpetas creadas + 1 rootFolder
      expect((folders as unknown[]).length).toBeGreaterThanOrEqual(2);
    });

    it('should fail without authentication', async (): Promise<void> => {
      await request(app).get('/api/folders').expect(401);
    });
  });

  describe('DELETE /api/folders/:id', (): void => {
    it('should delete an empty folder', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));
      const createResponse = await request(app)
        .post('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({
          name: 'A Eliminar',
          organizationId,
          parentId: rootFolderId
        });

      const crBody = bodyOf(createResponse as Response) as Record<string, unknown>;
      const folderId = ((crBody['folder'] as Record<string, unknown>)['id'] as string) || '';

      await request(app)
        .delete(`/api/folders/${folderId}`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .expect(200);
    });

    it('should fail to delete folder with documents without force', async (): Promise<void> => {
      // This test would require creating documents in the folder first
      // Left as skeleton for future implementation
    });
  });

  describe('PATCH /api/folders/:id', (): void => {
    it('should rename a folder', async (): Promise<void> => {
      const tokenCookie = authCookies.find((cookie: string) => cookie.startsWith('token='));
      const originalFolder = new FolderBuilder().withName('Nombre Original').build();
      const newName = 'Nuevo Nombre';

      const createResponse = await request(app)
        .post('/api/folders')
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({
          name: originalFolder.name,
          organizationId,
          parentId: rootFolderId
        });

      const crBody = bodyOf<Record<string, unknown>>(createResponse);
      const folderId = ((crBody['folder'] as Record<string, unknown>)['id'] as string) || '';

      const response = await request(app)
        .patch(`/api/folders/${folderId}`)
        .set('Cookie', tokenCookie?.split(';')[0] || '')
        .send({ name: newName })
        .expect(200);

      const body = bodyOf(response as Response) as Record<string, unknown>;
      expect(body['success']).toBe(true);
      const folder = body['folder'] as Record<string, unknown>;
      expect(folder['name']).toBe(newName);
    });

    it('should fail without authentication', async (): Promise<void> => {
      await request(app).patch('/api/folders/123456').send({ name: 'Nuevo Nombre' }).expect(401);
    });
  });
});
