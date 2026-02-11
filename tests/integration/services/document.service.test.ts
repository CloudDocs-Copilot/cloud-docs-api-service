import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as documentService from '../../../src/services/document.service';
import * as membershipService from '../../../src/services/membership.service';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';
import Folder from '../../../src/models/folder.model';
import Document from '../../../src/models/document.model';
import Membership, { MembershipRole, MembershipStatus } from '../../../src/models/membership.model';
import * as fs from 'fs';
import * as path from 'path';

let mongoServer: MongoMemoryServer;

describe('DocumentService Integration Tests', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testOrgId: mongoose.Types.ObjectId;
  let testOrgSlug: string;
  let rootFolderId: mongoose.Types.ObjectId;
  let testFolderId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // 1. Crear organización owner
    const owner = await User.create({
      name: 'Org Owner',
      email: 'owner@test.com',
      password: 'hashedPassword123',
      role: 'admin',
      storageUsed: 0
    });

    // 2. Crear organización
    const org = await Organization.create({
      name: 'Test Organization',
      slug: 'test-org',
      owner: owner._id,
      members: [owner._id],
      // Let the pre-save hook set the FREE plan settings
    });

    // 3. Crear membresía para el owner
    await Membership.create({
      user: owner._id,
      organization: org._id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date()
    });

    owner.organization = org._id as mongoose.Types.ObjectId;
    await owner.save();

    testOrgId = org._id as mongoose.Types.ObjectId;
    testOrgSlug = org.slug;

    // 4. Crear usuarios de test sin organización
    const user = await User.create({
      name: 'Test User',
      email: 'test@test.com',
      password: 'hashedPassword123',
      role: 'user',
      storageUsed: 0
    });

    const user2 = await User.create({
      name: 'Test User 2',
      email: 'test2@test.com',
      password: 'hashedPassword123',
      role: 'user',
      storageUsed: 0
    });

    testUserId = user._id as mongoose.Types.ObjectId;
    testUser2Id = user2._id as mongoose.Types.ObjectId;

    // 5. Agregar usuarios a la organización usando membership service
    await membershipService.createMembership({
      userId: testUserId.toString(),
      organizationId: testOrgId.toString(),
      role: MembershipRole.MEMBER,
    });

    await membershipService.createMembership({
      userId: testUser2Id.toString(),
      organizationId: testOrgId.toString(),
      role: MembershipRole.MEMBER,
    });

    // 6. Obtener usuarios actualizados con rootFolders
    const updatedUser = await User.findById(testUserId);
    rootFolderId = updatedUser!.rootFolder as mongoose.Types.ObjectId;

    // 7. Crear carpeta de prueba
    const testFolder = await Folder.create({
      name: 'Documents',
      displayName: 'My Documents',
      type: 'folder',
      organization: testOrgId,
      owner: testUserId,
      parent: rootFolderId,
      path: `/${testOrgSlug}/${testUserId}/Documents`,
      permissions: [{ userId: testUserId, role: 'owner' }]
    });

    testFolderId = testFolder._id as mongoose.Types.ObjectId;

    // Crear directorios físicos
    const storageRoot = path.join(process.cwd(), 'storage');
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const orgPath = path.join(storageRoot, testOrgSlug, testUserId.toString());
    const docsPath = path.join(orgPath, 'Documents');

    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Organization.deleteMany({});
    await Folder.deleteMany({});
    await Document.deleteMany({});
    await Membership.deleteMany({});

    // Limpiar directorios
    const storageRoot = path.join(process.cwd(), 'storage');
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    
    if (fs.existsSync(storageRoot)) {
      try {
        fs.rmSync(storageRoot, { recursive: true, force: true });
      } catch (err: any) {
        if (err && (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM')) {
          console.warn('Warning: could not fully remove storageRoot during cleanup:', err.code);
        } else {
          throw err;
        }
      }
    }
    if (fs.existsSync(uploadsRoot)) {
      try {
        fs.rmSync(uploadsRoot, { recursive: true, force: true });
      } catch (err: any) {
        if (err && (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM')) {
          console.warn('Warning: could not fully remove uploadsRoot during cleanup:', err.code);
        } else {
          throw err;
        }
      }
    }
  });

  describe('uploadDocument', () => {
    it('should upload document with required folderId', async () => {
      // Crear archivo temporal en uploads
      const uploadsPath = path.join(process.cwd(), 'uploads');
      const testFileName = `test-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsPath, testFileName);
      
      fs.writeFileSync(tempFilePath, 'Test content');

      const mockFile: any = {
        filename: testFileName,
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 12,
      };

      const doc = await documentService.uploadDocument({
        file: mockFile,
        userId: testUserId.toString(),
        folderId: testFolderId.toString(),
      });

      expect(doc).toBeDefined();
      expect(doc.filename).toBe(testFileName);
      expect(doc.originalname).toBe('test.txt');
      expect(doc.folder).toEqual(testFolderId);
      expect(doc.organization).toEqual(testOrgId);
      expect(doc.size).toBe(12);

      // Verificar que el archivo existe en el path del documento
      const storageRoot = path.join(process.cwd(), 'storage');
      const filePath = path.join(storageRoot, testOrgSlug, ...doc.path!.split('/').filter(p => p));
      expect(fs.existsSync(filePath)).toBe(true);

      // Verificar que el usuario's storageUsed se actualizó
      const updatedUser = await User.findById(testUserId);
      expect(updatedUser!.storageUsed).toBe(12);
    });

    it('should upload to rootFolder when folderId not provided', async () => {
      // Crear archivo temporal
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const testFileName = `test-${Date.now()}.txt`;
      const tempPath = path.join(uploadsDir, testFileName);
      fs.writeFileSync(tempPath, 'Hello World!');

      const mockFile: any = {
        filename: testFileName,
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 12,
      };

      // No proporcionar folderId - debe usar rootFolder del usuario
      const doc = await documentService.uploadDocument({
        file: mockFile,
        userId: testUserId.toString(),
        folderId: undefined, // No se proporciona
      });

      expect(doc).toBeDefined();
      expect(doc.filename).toBe(testFileName);
      expect(doc.folder).toEqual(rootFolderId); // Debe estar en la carpeta raíz
      expect(doc.organization).toEqual(testOrgId);
    });

    it('should fail without folderId when user has no rootFolder', async () => {
      // Crear un usuario sin rootFolder
      const userNoRoot = await User.create({
        name: 'User No Root',
        email: 'noroot@test.com',
        password: 'hashedPassword123',
        role: 'user',
        storageUsed: 0,
        organization: testOrgId,
        // No asignar rootFolder
      });

      // Crear membership sin rootFolder (forzar el caso)
      await Membership.create({
        user: userNoRoot._id,
        organization: testOrgId,
        role: MembershipRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        // Sin rootFolder
      });

      const mockFile: any = {
        filename: 'test.txt',
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 100,
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile,
          userId: userNoRoot._id.toString(),
          folderId: '', // String vacío, no se proporciona
        })
      ).rejects.toThrow('Membership does not have a root folder. Please contact support.');
    });

    it('should fail if storage quota exceeded', async () => {
      // Establecer storageUsed muy cerca del límite del plan FREE (1GB = 1073741824 bytes)
      const freeLimit = 1073741824; // 1GB
      await User.findByIdAndUpdate(testUserId, { storageUsed: freeLimit - 500 }); // Solo 500 bytes disponibles

      const uploadsPath = path.join(process.cwd(), 'uploads');
      const testFileName = `test-large-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsPath, testFileName);
      fs.writeFileSync(tempFilePath, 'x'.repeat(1000)); // 1000 bytes - debería exceder límite

      const mockFile: any = {
        filename: testFileName,
        originalname: 'large.txt',
        mimetype: 'text/plain',
        size: 1000,
      };

      await expect(
        documentService.uploadDocument({
          file: mockFile,
          userId: testUserId.toString(),
          folderId: testFolderId.toString(),
        })
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('should fail if user does not have editor access to folder', async () => {
      const mockFile: any = {
        filename: 'unauthorized.txt',
        originalname: 'unauthorized.txt',
        mimetype: 'text/plain',
        size: 100,
      };

      // User2 no tiene acceso a testFolder de User1
      await expect(
        documentService.uploadDocument({
          file: mockFile,
          userId: testUser2Id.toString(),
          folderId: testFolderId.toString(),
        })
      ).rejects.toThrow('User does not have editor access to this folder');
    });
  });

  describe('deleteDocument', () => {
    it('should delete document and update storage usage', async () => {
      // Crear archivo usando el servicio de upload primero
      const uploadsPath = path.join(process.cwd(), 'uploads');
      const testFileName = `delete-test-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsPath, testFileName);
      
      fs.writeFileSync(tempFilePath, 'Content to delete');

      const mockFile: any = {
        filename: testFileName,
        originalname: 'delete.txt',
        mimetype: 'text/plain',
        size: 17,
      };

      // Upload documento
      const doc = await documentService.uploadDocument({
        file: mockFile,
        userId: testUserId.toString(),
        folderId: testFolderId.toString(),
      });

      const storageRoot = path.join(process.cwd(), 'storage');
      const docPath = path.join(storageRoot, testOrgSlug, ...doc.path!.split('/').filter(p => p));

      // Verificar que el archivo existe
      expect(fs.existsSync(docPath)).toBe(true);

      const deleted = await documentService.deleteDocument({
        id: doc._id.toString(),
        userId: testUserId.toString(),
      });

      expect(deleted).toBeDefined();

      // Verificar que el archivo se eliminó
      expect(fs.existsSync(docPath)).toBe(false);

      // Verificar que el storageUsed se actualizó
      const updatedUser = await User.findById(testUserId);
      expect(updatedUser!.storageUsed).toBe(0);
    });

    it('should fail if user is not owner', async () => {
      const doc = await Document.create({
        filename: 'test.txt',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: testUserId,
        folder: testFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId}/Documents/test.txt`
      });

      await expect(
        documentService.deleteDocument({
          id: doc._id.toString(),
          userId: testUser2Id.toString(),
        })
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('moveDocument', () => {
    it('should move document to different folder', async () => {
      // Crear carpeta destino
      const targetFolder = await Folder.create({
        name: 'Archive',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: `/${testOrgSlug}/${testUserId}/Archive`,
        permissions: [{ userId: testUserId, role: 'owner' }]
      });

      // Crear documento primero con upload
      const uploadsPath = path.join(process.cwd(), 'uploads');
      const testFileName = `move-test-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsPath, testFileName);
      
      fs.writeFileSync(tempFilePath, 'Content to move');

      const mockFile: any = {
        filename: testFileName,
        originalname: 'move.txt',
        mimetype: 'text/plain',
        size: 15,
      };

      const doc = await documentService.uploadDocument({
        file: mockFile,
        userId: testUserId.toString(),
        folderId: testFolderId.toString(),
      });

      const storageRoot = path.join(process.cwd(), 'storage');
      const originalPath = path.join(storageRoot, testOrgSlug, ...doc.path!.split('/').filter(p => p));
      
      // Verificar que existe antes de mover
      expect(fs.existsSync(originalPath)).toBe(true);

      const moved = await documentService.moveDocument({
        documentId: doc._id.toString(),
        userId: testUserId.toString(),
        targetFolderId: targetFolder._id.toString(),
      });

      expect(moved.folder).toEqual(targetFolder._id);
      expect(moved.path).toContain('/Archive/');

      // Verificar que el archivo se movió físicamente
      const newPath = path.join(storageRoot, testOrgSlug, ...moved.path!.split('/').filter(p => p));
      expect(fs.existsSync(newPath)).toBe(true);
      expect(fs.existsSync(originalPath)).toBe(false);
    });

    it('should fail if user is not owner', async () => {
      const doc = await Document.create({
        filename: 'test.txt',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: testUserId,
        folder: testFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId}/Documents/test.txt`
      });

      await expect(
        documentService.moveDocument({
          documentId: doc._id.toString(),
          userId: testUser2Id.toString(),
          targetFolderId: rootFolderId.toString(),
        })
      ).rejects.toThrow('Only document owner can move it');
    });
  });

  describe('copyDocument', () => {
    it('should copy document to different folder', async () => {
      // Crear carpeta destino
      const targetFolder = await Folder.create({
        name: 'Backup',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolderId,
        path: `/${testOrgSlug}/${testUserId}/Backup`,
        permissions: [{ userId: testUserId, role: 'owner' }]
      });

      // Crear documento original con upload
      const uploadsPath = path.join(process.cwd(), 'uploads');
      const testFileName = `copy-test-${Date.now()}.txt`;
      const tempFilePath = path.join(uploadsPath, testFileName);
      
      fs.writeFileSync(tempFilePath, 'Content to copy');

      const mockFile: any = {
        filename: testFileName,
        originalname: 'original.txt',
        mimetype: 'text/plain',
        size: 15,
      };

      const doc = await documentService.uploadDocument({
        file: mockFile,
        userId: testUserId.toString(),
        folderId: testFolderId.toString(),
      });

      const storageRoot = path.join(process.cwd(), 'storage');
      const originalPath = path.join(storageRoot, testOrgSlug, ...doc.path!.split('/').filter(p => p));
      
      // Asegurar que el archivo físico existe antes de copiar
      if (!fs.existsSync(originalPath)) {
        const dir = path.dirname(originalPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(originalPath, 'test content for copy');
      }

      const copied = await documentService.copyDocument({
        documentId: doc._id.toString(),
        userId: testUserId.toString(),
        targetFolderId: targetFolder._id.toString(),
      });

      expect(copied._id).not.toEqual(doc._id);
      expect(copied.folder).toEqual(targetFolder._id);
      expect(copied.originalname).toContain('Copy of');
      expect(copied.uploadedBy).toEqual(testUserId);

      // Verificar que ambos archivos existen
      expect(fs.existsSync(originalPath)).toBe(true);
      
      const copiedPath = path.join(storageRoot, testOrgSlug, ...copied.path!.split('/').filter(p => p));
      expect(fs.existsSync(copiedPath)).toBe(true);

      // Verificar que se actualizó el storageUsed (15 original + 15 copia = 30)
      const updatedUser = await User.findById(testUserId);
      expect(updatedUser!.storageUsed).toBe(30);
    });

    it('should fail if storage quota exceeded', async () => {
      // Establecer storageUsed muy cerca del límite del plan FREE (1GB = 1073741824 bytes)
      const freeLimit = 1073741824; // 1GB
      await User.findByIdAndUpdate(testUserId, { storageUsed: freeLimit - 500 }); // Solo 500 bytes disponibles

      const doc = await Document.create({
        filename: 'test.txt',
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 1000, // Archivo de 1000 bytes - debería exceder el límite disponible
        uploadedBy: testUserId,
        folder: testFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId}/Documents/test.txt`
      });

      // Crear el archivo físico para que copy no falle por "file not found"
      const storageRoot = path.join(process.cwd(), 'storage');
      const physicalFilePath = path.join(storageRoot, testOrgSlug, testUserId.toString(), 'Documents', 'test.txt');
      if (!fs.existsSync(path.dirname(physicalFilePath))) {
        fs.mkdirSync(path.dirname(physicalFilePath), { recursive: true });
      }
      fs.writeFileSync(physicalFilePath, 'x'.repeat(1000)); // Crear archivo de 1000 bytes

      await expect(
        documentService.copyDocument({
          documentId: doc._id.toString(),
          userId: testUserId.toString(),
          targetFolderId: rootFolderId.toString(),
        })
      ).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('getUserRecentDocuments', () => {
    it('should return recent documents', async () => {
      // Crear varios documentos
      await Document.create({
        filename: 'doc1.txt',
        originalname: 'doc1.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: testUserId,
        folder: testFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId}/Documents/doc1.txt`,
        createdAt: new Date('2024-01-01')
      });

      await Document.create({
        filename: 'doc2.txt',
        originalname: 'doc2.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: testUserId,
        folder: testFolderId,
        organization: testOrgId,
        path: `/${testOrgSlug}/${testUserId}/Documents/doc2.txt`,
        createdAt: new Date('2024-01-02')
      });

      const recent = await documentService.getUserRecentDocuments({
        userId: testUserId.toString(),
        limit: 10
      });

      expect(recent).toHaveLength(2);
      // Los documentos deben estar ordenados por fecha descendente
      expect(recent[0].originalname).toBe('doc2.txt');
      expect(recent[1].originalname).toBe('doc1.txt');
    });

    it('should respect limit parameter', async () => {
      // Crear 5 documentos
      for (let i = 0; i < 5; i++) {
        await Document.create({
          filename: `doc${i}.txt`,
          originalName: `doc${i}.txt`,
          mimeType: 'text/plain',
          size: 100,
          uploadedBy: testUserId,
          folder: testFolderId,
          organization: testOrgId,
          path: `/${testOrgSlug}/${testUserId}/Documents/doc${i}.txt`
        });
      }

      const recent = await documentService.getUserRecentDocuments({
        userId: testUserId.toString(),
        limit: 3
      });

      expect(recent).toHaveLength(3);
    });
  });
});
