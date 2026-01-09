import mongoose from 'mongoose';
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

describe('DocumentController - New Endpoints Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testToken: string;
  let testToken2: string;
  let testOrgId: mongoose.Types.ObjectId;
  let rootFolderId: mongoose.Types.ObjectId;
  let subFolderId: mongoose.Types.ObjectId;
  let testDocId: mongoose.Types.ObjectId;

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
      active: true,
    });
    testUserId = user1._id;
    
    // Esperar 100ms para asegurar que tokenCreatedAt > user.updatedAt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'user@test.com',
      role: 'user',
    });

    const user2 = await User.create({
      name: 'Test User 2',
      email: 'user2@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true,
    });
    testUser2Id = user2._id;
    testToken2 = jwtService.signToken({
      id: testUser2Id.toString(),
      email: 'user2@test.com',
      role: 'user',
    });

    // Crear organización
    const org = await Organization.create({
      name: 'Test Org',
      owner: testUserId,
      members: [testUserId, testUser2Id],
    });
    testOrgId = org._id;

    // Crear carpetas
    const rootFolder = await Folder.create({
      name: `root_user_${testUserId}`,
      displayName: 'My Files',
      type: 'root',
      organization: testOrgId,
      owner: testUserId,
      path: '/',
      isRoot: true,
    });
    rootFolderId = rootFolder._id;

    const subFolder = await Folder.create({
      name: 'work-docs',
      displayName: 'Work Documents',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: rootFolderId,
      path: '/work-docs',
      isRoot: false,
    });
    subFolderId = subFolder._id;

    // Actualizar usuarios
    await User.findByIdAndUpdate(testUserId, {
      organization: testOrgId,
      rootFolder: rootFolderId,
      storageUsed: 0,
    });

    await User.findByIdAndUpdate(testUser2Id, {
      organization: testOrgId,
    });

    // Crear directorio físico
    const orgSlug = 'test-org';
    const orgDir = path.join(process.cwd(), 'storage', orgSlug, testUserId.toString());
    fs.mkdirSync(orgDir, { recursive: true });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();

    // Limpiar directorios de prueba
    const storageDir = path.join(process.cwd(), 'storage');
    if (fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await Document.deleteMany({});
  });

  describe('GET /api/documents/recent', () => {
    beforeEach(async () => {
      // Crear varios documentos con diferentes fechas
      const now = Date.now();
      
      await Document.create({
        filename: 'old-doc.txt',
        originalname: 'old-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/old-doc.txt',
        size: 1000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
        uploadedAt: new Date(now - 3600000), // 1 hora atrás
      });

      await Document.create({
        filename: 'recent-doc-1.txt',
        originalname: 'recent-doc-1.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/recent-doc-1.txt',
        size: 2000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
        uploadedAt: new Date(now - 60000), // 1 minuto atrás
      });

      await Document.create({
        filename: 'recent-doc-2.txt',
        originalname: 'recent-doc-2.txt',
        organization: testOrgId,
        folder: subFolderId,
        path: '/work-docs/recent-doc-2.txt',
        size: 3000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
        uploadedAt: new Date(now - 30000), // 30 segundos atrás
      });

      // Documento de otro usuario
      await Document.create({
        filename: 'other-user-doc.txt',
        originalname: 'other-user-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/other-user-doc.txt',
        size: 1500,
        mimeType: 'text/plain',
        uploadedBy: testUser2Id,
        uploadedAt: new Date(now),
      });
    });

    it('should return recent documents of authenticated user', async () => {
      const response = await request(app)
        .get('/api/documents/recent')
        .query({ organizationId: testOrgId.toString() })
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.documents).toHaveLength(3);
      
      // Verificar orden (más reciente primero)
      expect(response.body.documents[0].originalname).toBe('recent-doc-2.txt');
      expect(response.body.documents[1].originalname).toBe('recent-doc-1.txt');
      expect(response.body.documents[2].originalname).toBe('old-doc.txt');
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/documents/recent')
        .query({ organizationId: testOrgId.toString(), limit: 2 })
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.documents).toHaveLength(2);
      expect(response.body.documents[0].originalname).toBe('recent-doc-2.txt');
      expect(response.body.documents[1].originalname).toBe('recent-doc-1.txt');
    });

    it('should fail without organizationId', async () => {
      const response = await request(app)
        .get('/api/documents/recent')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/documents/recent')
        .query({ organizationId: testOrgId.toString() });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/documents/:id', () => {
    beforeEach(async () => {
      const doc = await Document.create({
        filename: 'test-doc.txt',
        originalname: 'test-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/test-doc.txt',
        size: 1000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
      });
      testDocId = doc._id;
    });

    it('should get document details if user is owner', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.document.id).toBe(testDocId.toString());
      expect(response.body.document.originalname).toBe('test-doc.txt');
      expect(response.body.document.size).toBe(1000);
    });

    it('should get document details if shared with user', async () => {
      // Compartir documento con user2
      await Document.findByIdAndUpdate(testDocId, {
        $addToSet: { sharedWith: testUser2Id },
      });

      const response = await request(app)
        .get(`/api/documents/${testDocId}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.document.id).toBe(testDocId.toString());
    });

    it('should fail if user has no access', async () => {
      const response = await request(app)
        .get(`/api/documents/${testDocId}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should fail if document does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .get(`/api/documents/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });

    it('should fail without authentication', async () => {
      const response = await request(app).get(`/api/documents/${testDocId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/documents/:id/move', () => {
    let targetFolderId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      // Crear documento en rootFolder
      const doc = await Document.create({
        filename: 'movable-doc.txt',
        originalname: 'movable-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: `/storage/test-org/${testUserId}/movable-doc.txt`,
        size: 1000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
      });
      testDocId = doc._id;

      // Crear carpeta destino
      const targetFolder = await Folder.create({
        name: 'archives',
        displayName: 'Archives',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: '/archives',
        isRoot: false,
      });
      targetFolderId = targetFolder._id;

      // Crear archivos físicos
      const orgSlug = 'test-org';
      const sourcePath = path.join(
        process.cwd(),
        'storage',
        orgSlug,
        testUserId.toString(),
        'movable-doc.txt'
      );
      const targetDir = path.join(
        process.cwd(),
        'storage',
        orgSlug,
        testUserId.toString(),
        'archives'
      );
      
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(sourcePath, 'test content');
    });

    it('should move document to target folder if user is owner', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/move`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.document.folder).toBe(targetFolderId.toString());
      expect(response.body.document.path).toContain('/archives/');
    });

    it('should fail if user is not the owner', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/move`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(403);
    });

    it('should fail if targetFolderId is missing', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/move`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should fail if target folder does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/documents/${testDocId}/move`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: fakeId });

      expect(response.status).toBe(404);
    });

    it('should fail if document does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/documents/${fakeId}/move`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/documents/:id/copy', () => {
    let targetFolderId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      // Crear documento en rootFolder
      const doc = await Document.create({
        filename: 'copyable-doc.txt',
        originalname: 'copyable-doc.txt',
        organization: testOrgId,
        folder: rootFolderId,
        path: '/copyable-doc.txt', // Relativo a la org, sin /storage/
        size: 1000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
      });
      testDocId = doc._id;

      // Crear carpeta destino
      const targetFolder = await Folder.create({
        name: 'backups',
        displayName: 'Backups',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: '/backups',
        isRoot: false,
      });
      targetFolderId = targetFolder._id;

      // Crear archivos físicos
      const orgSlug = 'test-org';
      const sourcePath = path.join(
        process.cwd(),
        'storage',
        orgSlug,
        'copyable-doc.txt' // Path relativo al slug
      );
      const targetDir = path.join(
        process.cwd(),
        'storage',
        orgSlug,
        'backups'
      );

      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(sourcePath, 'test content');

      // Actualizar storageUsed
      await User.findByIdAndUpdate(testUserId, { storageUsed: 1000 });
    });

    it('should copy document to target folder if user has access', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/copy`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.document.folder).toBe(targetFolderId.toString());
      expect(response.body.document.path).toContain('/backups/');
      expect(response.body.document._id).not.toBe(testDocId.toString());

      // Verificar que se actualizó storageUsed
      const user = await User.findById(testUserId);
      expect(user?.storageUsed).toBe(2000); // 1000 original + 1000 copia
    });

    it('should fail if storage quota exceeded', async () => {
      // Actualizar organización para tener límite bajo
      await Organization.findByIdAndUpdate(testOrgId, {
        'settings.maxStoragePerUser': 1500,
      });

      const response = await request(app)
        .post(`/api/documents/${testDocId}/copy`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Storage quota');
    });

    it('should fail if targetFolderId is missing', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/copy`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should fail if document does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/documents/${fakeId}/copy`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(404);
    });

    it('should fail if user has no access to document', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocId}/copy`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({ targetFolderId: targetFolderId.toString() });

      expect(response.status).toBe(403);
    });
  });
});
