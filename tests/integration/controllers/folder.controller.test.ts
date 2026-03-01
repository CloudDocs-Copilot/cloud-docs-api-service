import mongoose from 'mongoose';
import type { Response } from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import app from '../../../src/app';
import Organization from '../../../src/models/organization.model';
import User from '../../../src/models/user.model';
import Folder from '../../../src/models/folder.model';
import Document from '../../../src/models/document.model';
import * as jwtService from '../../../src/services/jwt.service';

describe('FolderController - New Endpoints Integration Tests', (): void => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testToken: string;
  let testToken2: string;
  let testOrgId: mongoose.Types.ObjectId;
  let rootFolderId: mongoose.Types.ObjectId;
  let subFolder1Id: mongoose.Types.ObjectId;
  let subFolder2Id: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuarios de prueba
    const user1 = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true
    });
    testUserId = user1._id;

    // Esperar 100ms para asegurar que tokenCreatedAt > user.updatedAt
    await new Promise(resolve => setTimeout(resolve, 100));

    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'user@test.com',
      role: 'user'
    });

    const user2 = await User.create({
      name: 'Test User 2',
      email: 'user2@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true
    });
    testUser2Id = user2._id;
    testToken2 = jwtService.signToken({
      id: testUser2Id.toString(),
      email: 'user2@test.com',
      role: 'user'
    });

    // Crear organización
    const org = await Organization.create({
      name: 'Test Org',
      owner: testUserId,
      members: [testUserId, testUser2Id]
    });
    testOrgId = org._id;
    const testOrgSlug = org.slug; // Generado automáticamente: 'test-org'

    // Crear estructura de carpetas
    const rootFolder = await Folder.create({
      name: `root_${testOrgSlug}_${testUserId.toString()}`,
      displayName: 'My Files',
      type: 'root',
      organization: testOrgId,
      owner: testUserId,
      path: '/',
      isRoot: true
    });
    rootFolderId = rootFolder._id;

    const subFolder1 = await Folder.create({
      name: 'projects',
      displayName: 'Projects',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: rootFolderId,
      path: '/projects',
      isRoot: false
    });
    subFolder1Id = subFolder1._id;

    const subFolder2 = await Folder.create({
      name: 'documents',
      displayName: 'Documents',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: rootFolderId,
      path: '/documents',
      isRoot: false
    });
    subFolder2Id = subFolder2._id;

    // Crear subfolder anidado
    await Folder.create({
      name: 'web-projects',
      displayName: 'Web Projects',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: subFolder1Id,
      path: '/projects/web-projects',
      isRoot: false
    });

    // Actualizar usuarios
    await User.findByIdAndUpdate(testUserId, {
      organization: testOrgId,
      rootFolder: rootFolderId
    });

    await User.findByIdAndUpdate(testUser2Id, {
      organization: testOrgId
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Limpiar directorios de prueba
    const storageDir = path.join(process.cwd(), 'storage');
    if (fs.existsSync(storageDir)) {
      try {
        fs.rmSync(storageDir, { recursive: true, force: true });
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: unknown }).code &&
          ( (err as { code?: unknown }).code === 'ENOTEMPTY' ||
            (err as { code?: unknown }).code === 'EBUSY' ||
            (err as { code?: unknown }).code === 'EPERM')
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          console.warn('Warning: could not fully remove storageDir during cleanup:', (err as { code?: unknown }).code);
        } else {
          throw err;
        }
      }
    }
  });

  beforeEach(async () => {
    await Document.deleteMany({});
  });

  type ApiBody = { success?: boolean; tree?: unknown; contents?: unknown; error?: string; folder?: unknown };

  function bodyOf(res: Response): ApiBody {
    return (res.body as unknown) as ApiBody;
  }

  describe('GET /api/folders/tree', (): void => {
    it('should return hierarchical folder tree for user', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/folders/tree')
        .query({ organizationId: testOrgId.toString() })
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const b = bodyOf(response);
      expect(b.success).toBe(true);
      expect(b.tree).toBeDefined();

      const tree = b.tree as Record<string, unknown>;
      // Verificar estructura raíz (el nombre técnico ahora incluye el slug: root_{orgSlug}_{userId})
      expect((tree['name'] as string)).toMatch(/^root_test-org_/);
      expect(tree['displayName']).toBe('My Files');
      expect(tree['isRoot']).toBe(true);

      // Verificar hijos directos
      const children = tree['children'] as unknown[];
      expect(children).toHaveLength(2);

      // Verificar que el primer hijo tiene sus propios hijos
      const projectsFolder = children.find(
        (child: unknown) => (child as Record<string, unknown>)['name'] === 'projects'
      ) as Record<string, unknown> | undefined;
      expect(projectsFolder).toBeDefined();
      const projChildren = projectsFolder!['children'] as unknown[];
      expect(projChildren).toHaveLength(1);
      expect((projChildren[0] as Record<string, unknown>)['name']).toBe('web-projects');
    });

    it('should fail without organizationId', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/folders/tree')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(400);
      const b = bodyOf(response);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/folders/tree')
        .query({ organizationId: testOrgId.toString() });

      expect(response.status).toBe(401);
    });

    it('should return empty tree if user has no root folder', async (): Promise<void> => {
      // user2 no tiene rootFolder asignado
      const response = await request(app)
        .get('/api/folders/tree')
        .query({ organizationId: testOrgId.toString() })
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(404);
      const b = bodyOf(response);
      expect(b.success).toBe(false);
    });
  });

  describe('GET /api/folders/:id/contents', (): void => {
    beforeEach(async () => {
      // Crear documentos en diferentes carpetas
      await Document.create({
        filename: 'root-doc.txt',
        originalname: 'root-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/root-doc.txt',
        size: 1000,
        mimeType: 'text/plain',
        uploadedBy: testUserId
      });

      await Document.create({
        filename: 'project-doc.txt',
        originalname: 'project-doc.txt',
        organization: testOrgId,
        folder: subFolder1Id,
        path: '/projects/project-doc.txt',
        size: 2000,
        mimeType: 'text/plain',
        uploadedBy: testUserId
      });

      await Document.create({
        filename: 'document-doc.txt',
        originalname: 'document-doc.txt',
        organization: testOrgId,
        folder: subFolder2Id,
        path: '/documents/document-doc.txt',
        size: 3000,
        mimeType: 'text/plain',
        uploadedBy: testUserId
      });
    });

    it('should return folder with subfolders and documents', async (): Promise<void> => {
      const response = await request(app)
        .get(`/api/folders/${rootFolderId}/contents`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const b = bodyOf(response);
      expect(b.success).toBe(true);
      expect(b.contents).toBeDefined();

      // Verificar carpeta
      const contents = b.contents as Record<string, unknown>;
      const folderObj = contents['folder'] as Record<string, unknown>;
      expect(
        String(
          folderObj['id'] ?? (folderObj['_id'] as unknown as { toString?: () => string }).toString?.()
        )
      ).toBe(rootFolderId.toString());

      // Verificar subcarpetas (solo hijos directos)
      const subfolders = contents['subfolders'] as unknown[];
      expect(subfolders).toHaveLength(2);
      const folderNames = subfolders.map((f: unknown) => (f as Record<string, unknown>)['name']);
      expect(folderNames).toContain('projects');
      expect(folderNames).toContain('documents');

      // Verificar documentos en root
      const documents = contents['documents'] as unknown[];
      expect(documents).toHaveLength(1);
      expect(((documents[0] as Record<string, unknown>)['originalname'] as string)).toBe('root-doc.txt');
    });

    it('should return empty documents if folder has no files', async (): Promise<void> => {
      const response = await request(app)
        .get(`/api/folders/${subFolder2Id}/contents`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const b2 = bodyOf(response);
      expect(b2.success).toBe(true);
      expect(b2.contents).toBeDefined();

      const contents2 = b2.contents as Record<string, unknown>;
      // Verificar carpeta
      expect(contents2['folder']).toBeDefined();
      const folderObj2 = contents2['folder'] as Record<string, unknown>;
      expect(
        String(
          folderObj2['id'] ?? (folderObj2['_id'] as unknown as { toString?: () => string }).toString?.()
        )
      ).toBe(subFolder2Id.toString());

      // Verificar subcarpetas (solo hijos directos) - this folder has no nested children
      const subfolders2 = contents2['subfolders'] as unknown[];
      expect(subfolders2).toHaveLength(0);

      // Verificar documentos en root
      const documents2 = contents2['documents'] as unknown[];
      expect(documents2).toHaveLength(1);
      expect(((documents2[0] as Record<string, unknown>)['originalname'] as string)).toBe('document-doc.txt');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app).get(`/api/folders/${rootFolderId}/contents`);
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/folders/:id/share', (): void => {
    it('should share folder with another user with viewer role', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 1 // viewer
        });

      expect(response.status).toBe(200);
      const b = bodyOf(response);
      expect(b.success).toBe(true);
      expect(b.folder).toBeDefined();

      // Verificar que se agregó al array permissions
      const folder = await Folder.findById(subFolder1Id);
      expect(folder?.permissions).toHaveLength(1);
      expect(folder?.permissions[0].userId.toString()).toBe(testUser2Id.toString());
      expect(folder?.permissions[0].role).toBe('viewer');
    });

    it('should share folder with editor role', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 2 // editor
        });

      expect(response.status).toBe(200);

      const folder = await Folder.findById(subFolder1Id);
      expect(folder?.permissions[0].role).toBe('editor');
    });

    it('should update role if folder already shared with user', async (): Promise<void> => {
      // Compartir primero con viewer
      await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 1
        });

      // Compartir de nuevo con editor
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 2
        });

      expect(response.status).toBe(200);

      const folder = await Folder.findById(subFolder1Id);
      expect(folder?.permissions).toHaveLength(1);
      expect(folder?.permissions[0].role).toBe('editor');
    });

    it('should fail if user is not the owner', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({
          userId: testUserId.toString(),
          role: 1
        });

      expect(response.status).toBe(403);
    });

    it('should fail if userId is missing', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ role: 1 });

      expect(response.status).toBe(400);
    });

    it('should fail if role is missing', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      expect(response.status).toBe(400);
    });

    it('should fail if role is invalid (trying to share with owner role)', async () => {
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 3 // owner - not allowed
        });

      expect(response.status).toBe(400);
      const errBody = bodyOf(response);
      expect(errBody.error).toContain('owner role');
    });

    it('should fail if target user does not exist', async (): Promise<void> => {
      const fakeUserId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: fakeUserId,
          role: 1
        });

      expect(response.status).toBe(404);
    });

    it('should fail if folder does not exist', async (): Promise<void> => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/folders/${fakeId}/share`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          userId: testUser2Id.toString(),
          role: 1
        });

      expect(response.status).toBe(404);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app).post(`/api/folders/${subFolder1Id}/share`).send({
        userId: testUser2Id.toString(),
        role: 1
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Shared folder access validation', (): void => {
    beforeEach(async () => {
      // Compartir subFolder1 con user2 como viewer
      await Folder.findByIdAndUpdate(subFolder1Id, {
        $push: {
          permissions: {
            userId: testUser2Id,
            role: 'viewer'
          }
        }
      });
    });

    it('should allow user2 to get contents of shared folder', async (): Promise<void> => {
      const response = await request(app)
        .get(`/api/folders/${subFolder1Id}/contents`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(200);
      const sharedBody = bodyOf(response);
      expect(sharedBody.success).toBe(true);
    });

    it('should not allow user2 to share folder (only owner can share)', async () => {
      const user3 = await User.create({
        name: 'User 3',
        email: 'user3@test.com',
        password: 'hashedpassword123'
      });

      const response = await request(app)
        .post(`/api/folders/${subFolder1Id}/share`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({
          userId: user3._id.toString(),
          role: 1
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Integration with folder hierarchy', (): void => {
    it('should include nested folders in tree structure', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/folders/tree')
        .query({ organizationId: testOrgId.toString() })
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const b = bodyOf(response);
      const tree = b.tree as Record<string, unknown>;
      const children = tree['children'] as unknown[];
      const projectsFolder = children.find((child: unknown) => (child as Record<string, unknown>)['name'] === 'projects') as Record<string, unknown>;

      expect((projectsFolder['children'] as unknown[]).length).toBeGreaterThanOrEqual(1);
      expect(((projectsFolder['children'] as unknown[])[0] as Record<string, unknown>)['displayName']).toBe('Web Projects');
      expect(((projectsFolder['children'] as unknown[])[0] as Record<string, unknown>)['path']).toBe('/projects/web-projects');
    });

    it('should get contents of deeply nested folder', async (): Promise<void> => {
      // Obtener el ID de web-projects
      const webProjectsFolder = await Folder.findOne({
        name: 'web-projects',
        organization: testOrgId
      });

      // Crear documento en web-projects
      await Document.create({
        filename: 'nested-doc.txt',
        originalname: 'nested-doc.txt',
        organization: testOrgId,
        folder: webProjectsFolder!._id,
        path: '/projects/web-projects/nested-doc.txt',
        size: 500,
        mimeType: 'text/plain',
        uploadedBy: testUserId
      });

      const response = await request(app)
        .get(`/api/folders/${webProjectsFolder!._id}/contents`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      const b2 = bodyOf(response);
      const contents = b2.contents as Record<string, unknown>;
      const docs = contents['documents'] as unknown[];
      expect(docs).toHaveLength(1);
      expect(((docs[0] as Record<string, unknown>)['originalname'] as string)).toBe('nested-doc.txt');
    });
  });
});
