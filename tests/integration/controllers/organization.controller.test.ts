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
import { createMembership } from '../../../src/services/membership.service';
import { MembershipRole } from '../../../src/models/membership.model';

describe('OrganizationController Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testToken: string;
  let testToken2: string;
  let testOrgId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Crear usuarios de prueba
    const user1 = await User.create({
      name: 'Test Owner',
      email: 'owner@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true,
    });
    testUserId = user1._id;
    
    // Esperar 100ms para asegurar que tokenCreatedAt > user.updatedAt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'owner@test.com',
      role: 'user',
    });

    const user2 = await User.create({
      name: 'Test Member',
      email: 'member@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true,
    });
    testUser2Id = user2._id;
    testToken2 = jwtService.signToken({
      id: testUser2Id.toString(),
      email: 'member@test.com',
      role: 'user',
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
      } catch (err: any) {
        if (err && (err.code === 'ENOTEMPTY' || err.code === 'EBUSY' || err.code === 'EPERM')) {
          console.warn('Warning: could not fully remove storageDir during cleanup:', err.code);
        } else {
          throw err;
        }
      }
    }
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await Folder.deleteMany({});
    await Document.deleteMany({});
    // Limpiar usuarios creados en tests (outsider, etc) pero mantener test users
    await User.deleteMany({ email: { $nin: ['owner@test.com', 'member@test.com'] } });
    await User.updateMany({}, { $unset: { organization: 1, rootFolder: 1 }, storageUsed: 0 });
  });

  describe('POST /api/organizations', () => {
    it('should create a new organization with authenticated user as owner', async () => {
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Organization',
          settings: {
            maxStoragePerUser: 10737418240, // 10GB
            maxUsers: 100,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.organization).toBeDefined();
      expect(response.body.organization.name).toBe('Test Organization');
      expect(response.body.organization.slug).toBe('test-organization');
      expect(response.body.organization.owner.toString()).toBe(testUserId.toString());
      expect(response.body.organization.members).toContain(testUserId.toString());

      // Verificar que se creó el directorio físico
      const orgSlug = response.body.organization.slug;
      const orgDir = path.join(process.cwd(), 'storage', orgSlug);
      expect(fs.existsSync(orgDir)).toBe(true);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/organizations')
        .send({ name: 'Test Org' });

      expect(response.status).toBe(401);
    });

    it('should fail with invalid name (too short)', async () => {
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'A' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should create organization with default settings', async () => {
      const response = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Default Settings Org' });

      expect(response.status).toBe(201);
      expect(response.body.organization.settings.maxStoragePerUser).toBe(1073741824); // 1GB FREE plan default
      expect(response.body.organization.settings.maxUsers).toBe(3); // FREE plan max users
    });
  });

  describe('GET /api/organizations', () => {
    beforeEach(async () => {
      // Crear organización de prueba
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId],
      });
      testOrgId = org._id.toString();

      // Crear membresía activa para el owner (requerida por middleware)
      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
    });

    it('should list all organizations where user is member', async () => {
      // Crear segunda organización donde el usuario también es miembro
      const secondOrg = await Organization.create({
        name: 'Second Org',
        owner: testUser2Id,
        members: [testUser2Id, testUserId],
      });

      // Crear membresía para el usuario en la segunda organización
      await createMembership({
        userId: testUserId.toString(),
        organizationId: secondOrg._id.toString(),
        role: MembershipRole.MEMBER,
      });

      const response = await request(app)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.memberships).toHaveLength(2);
    });

    it('should not list inactive organizations', async () => {
      await Organization.create({
        name: 'Inactive Org',
        owner: testUserId,
        members: [testUserId],
        active: false,
      });

      const response = await request(app)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.memberships).toHaveLength(1);
      const orgField = response.body.memberships[0].organization;
      const orgId = orgField?._id || orgField?.id || orgField;
      expect(orgId.toString()).toBe(testOrgId);
    });

    it('should fail without authentication', async () => {
      const response = await request(app).get('/api/organizations');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/organizations/:id', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId],
      });
      testOrgId = org._id.toString();

      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
    });

    it('should get organization details if user is member', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization.id).toBe(testOrgId);
      expect(response.body.organization.name).toBe('Test Org');
    });

    it('should fail if user is not a member', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .get(`/api/organizations/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/organizations/:id', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId],
      });
      testOrgId = org._id.toString();

      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
    });

    it('should update organization if user is owner', async () => {
      const response = await request(app)
        .put(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Updated Organization Name',
          settings: { maxUsers: 200 },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.organization.name).toBe('Updated Organization Name');
      expect(response.body.organization.slug).toBe('updated-organization-name');
      expect(response.body.organization.settings.maxUsers).toBe(200);
    });

    it('should fail if user is not the owner', async () => {
      // Agregar user2 como miembro pero no owner
      await Organization.findByIdAndUpdate(testOrgId, {
        $addToSet: { members: testUser2Id },
      });

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(403);
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .put(`/api/organizations/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/organizations/:id', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId],
      });
      testOrgId = org._id.toString();

      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
    });

    it('should soft delete organization if user is owner', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verificar soft delete
      const org = await Organization.findById(testOrgId);
      expect(org?.active).toBe(false);
    });

    it('should fail if user is not the owner', async () => {
      await Organization.findByIdAndUpdate(testOrgId, {
        $addToSet: { members: testUser2Id },
      });

      const response = await request(app)
        .delete(`/api/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(403);
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .delete(`/api/organizations/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/organizations/:id/members', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId, testUser2Id],
      });
      testOrgId = org._id.toString();

      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
      await createMembership({
        userId: testUser2Id.toString(),
        organizationId: testOrgId,
        role: MembershipRole.MEMBER,
      });
    });

    it('should list all organization members', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.members).toHaveLength(2);
      // Membership objects include populated `user` — check nested user fields
      expect(response.body.members[0]).toHaveProperty('user');
      expect(response.body.members[0].user).toHaveProperty('name');
      expect(response.body.members[0].user).toHaveProperty('email');
    });

    it('should fail if user is not a member', async () => {
      // Crear tercera user que no es miembro
      const user3 = await User.create({
        name: 'Outsider',
        email: 'outsider@test.com',
        password: 'hashedpassword123',
        active: true,
      });
      const token3 = jwtService.signToken({
        id: user3._id.toString(),
        email: 'outsider@test.com',
        role: 'user',
      });

      const response = await request(app)
        .get(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${token3}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/organizations/:id/members', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId],
      });
      testOrgId = org._id.toString();

      // Asignar organización al owner
      await User.findByIdAndUpdate(testUserId, { organization: testOrgId });

      // Crear membresía del owner
      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
    });

    it('should add member to organization if user is owner', async () => {
      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verificar que el usuario fue agregado
      const org = await Organization.findById(testOrgId);
      expect(org?.members).toContainEqual(testUser2Id);

      // Verificar que se actualizó el usuario
      const user = await User.findById(testUser2Id);
      expect(user?.organization?.toString()).toBe(testOrgId);

      // Verificar que se creó la carpeta raíz
      const rootFolder = await Folder.findOne({
        owner: testUser2Id,
        isRoot: true,
        organization: testOrgId,
      });
      expect(rootFolder).toBeDefined();
    });

    it('should fail if user is not the owner', async () => {
      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({ userId: testUser2Id.toString() });

      expect(response.status).toBe(403);
    });

    it('should fail if user to add does not exist', async () => {
      const fakeUserId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: fakeUserId });

      expect(response.status).toBe(404);
    });

    it('should fail if user is already a member', async () => {
      // Agregar user2 primero
      await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      // Intentar agregar de nuevo
      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      expect(response.status).toBe(409); // 409 Conflict es más apropiado
      expect(response.body.error).toContain('already a member');
    });

    it('should fail if organization has reached max users', async () => {
      // Actualizar org para tener maxUsers = 1 (solo el owner)
      await Organization.findByIdAndUpdate(testOrgId, {
        'settings.maxUsers': 1,
      });

      const response = await request(app)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('maximum user limit');
    });
  });

  describe('DELETE /api/organizations/:id/members/:userId', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId, testUser2Id],
      });
      testOrgId = org._id.toString();

      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
      await createMembership({
        userId: testUser2Id.toString(),
        organizationId: testOrgId,
        role: MembershipRole.MEMBER,
      });
    });

    it('should remove member from organization if user is owner', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrgId}/members/${testUser2Id}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verificar que el usuario fue removido
      const org = await Organization.findById(testOrgId);
      expect(org?.members).not.toContainEqual(testUser2Id);
    });

    it('should fail if user is not the owner', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrgId}/members/${testUser2Id}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(response.status).toBe(403);
    });

    it('should fail if trying to remove the owner', async () => {
      const response = await request(app)
        .delete(`/api/organizations/${testOrgId}/members/${testUserId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot remove the owner');
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .delete(`/api/organizations/${fakeId}/members/${testUser2Id}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/organizations/:id/stats', () => {
    beforeEach(async () => {
      const org = await Organization.create({
        name: 'Test Org',
        owner: testUserId,
        members: [testUserId, testUser2Id],
      });
      testOrgId = org._id.toString();

      // Crear membresías para ambos usuarios
      await createMembership({
        userId: testUserId.toString(),
        organizationId: testOrgId,
        role: MembershipRole.OWNER,
      });
      await createMembership({
        userId: testUser2Id.toString(),
        organizationId: testOrgId,
        role: MembershipRole.MEMBER,
      });
      // Usar carpetas raíz creadas por las membresías
      const rootFolder1 = await Folder.findOne({
        owner: testUserId,
        organization: testOrgId,
        isRoot: true,
      });
      const rootFolder2 = await Folder.findOne({
        owner: testUser2Id,
        organization: testOrgId,
        isRoot: true,
      });

      if (!rootFolder1 || !rootFolder2) {
        throw new Error('Root folders not found for users');
      }

      const rootFolder1Id = rootFolder1._id;
      const rootFolder2Id = rootFolder2._id;

      // Actualizar usuarios con storageUsed
      await User.findByIdAndUpdate(testUserId, {
        organization: testOrgId,
        rootFolder: rootFolder1Id,
        storageUsed: 1000000, // 1MB
      });

      await User.findByIdAndUpdate(testUser2Id, {
        organization: testOrgId,
        rootFolder: rootFolder2Id,
        storageUsed: 2000000, // 2MB
      });

      // Crear documentos
      await Document.create({
        filename: 'doc1.txt',
        originalname: 'doc1.txt',
        organization: testOrgId,
        folder: rootFolder1Id,
        path: '/doc1.txt',
        size: 1000000,
        mimeType: 'text/plain',
        uploadedBy: testUserId,
      });

      await Document.create({
        filename: 'doc2.txt',
        originalname: 'doc2.txt',
        organization: testOrgId,
        folder: rootFolder2Id,
        path: '/doc2.txt',
        size: 2000000,
        mimeType: 'text/plain',
        uploadedBy: testUser2Id,
      });

      // Crear subfolder
      await Folder.create({
        name: 'subfolder',
        displayName: 'Subfolder',
        type: 'folder',
        organization: testOrgId,
        owner: testUserId,
        parent: rootFolder1Id,
        path: '/subfolder',
        isRoot: false,
      });
    });

    it('should return organization storage statistics', async () => {
      const response = await request(app)
        .get(`/api/organizations/${testOrgId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.totalUsers).toBe(2);
      expect(response.body.stats.totalStorageLimit).toBe(2147483648); // 2 users * 1GB (FREE plan)
      expect(response.body.stats.totalDocuments).toBe(2);
      expect(response.body.stats.totalFolders).toBe(3); // 2 root + 1 subfolder
    });

    it('should fail if user is not a member', async () => {
      const user3 = await User.create({
        name: 'Outsider',
        email: 'outsider@test.com',
        password: 'hashedpassword123',
        active: true,
      });
      const token3 = jwtService.signToken({
        id: user3._id.toString(),
        email: 'outsider@test.com',
        role: 'user',
      });

      const response = await request(app)
        .get(`/api/organizations/${testOrgId}/stats`)
        .set('Authorization', `Bearer ${token3}`);

      expect(response.status).toBe(403);
    });

    it('should fail if organization does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .get(`/api/organizations/${fakeId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });
  });
});
