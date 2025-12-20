import { request, app } from '../setup';
import { registerAndLogin } from '../helpers';
import { folderUser, basicFolder, duplicateFolder, multipleFolders } from '../fixtures';
import { FolderBuilder } from '../builders';

/**
 * Tests de integración para endpoints de carpetas
 * Prueba creación, listado, eliminación y renombrado de carpetas
 */
describe('Folder Endpoints', () => {
  let authToken: string;
  let userId: string;

  // Register and authenticate user before tests
  beforeEach(async () => {
    const auth = await registerAndLogin({
      name: folderUser.name,
      email: folderUser.email,
      password: folderUser.password
    });
    authToken = auth.token;
    userId = auth.userId;
  });

  describe('POST /api/folders', () => {
    it('should create a new folder', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: basicFolder.name })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(basicFolder.name);
      expect(response.body.owner).toBe(userId);
    });

    it('should fail without authentication token', async () => {
      const response = await request(app)
        .post('/api/folders')
        .send({ name: basicFolder.name })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should fail with duplicate name for same user', async () => {
      // Create first folder
      await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: duplicateFolder.name });

      // Try to create folder with same name
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: duplicateFolder.name })
        .expect(409);

      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/folders', () => {
    it('should list user folders', async () => {
      // Create some folders
      for (const folder of multipleFolders.slice(0, 2)) {
        await request(app)
          .post('/api/folders')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: folder.name });
      }

      const response = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .get('/api/folders')
        .expect(401);
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('should delete an empty folder', async () => {
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

    it('should fail to delete folder with documents without force', async () => {
      // This test would require creating documents in the folder first
      // Left as skeleton for future implementation
    });
  });

  describe('PATCH /api/folders/:id', () => {
    it('should rename a folder', async () => {
      const originalFolder = new FolderBuilder().withName('Nombre Original').build();
      const newName = 'Nuevo Nombre';

      const createResponse = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: originalFolder.name });

      const folderId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/folders/${folderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: newName })
        .expect(200);

      expect(response.body.name).toBe(newName);
    });

    it('should fail without authentication', async () => {
      await request(app)
        .patch('/api/folders/123456')
        .send({ name: 'Nuevo Nombre' })
        .expect(401);
    });
  });
});
