// tests/integration/controllers/organization.controller.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import express from 'express';
import type { Request as ExRequest, Response as ExResponse, NextFunction } from 'express';

import User from '../../../src/models/user.model';
import * as jwtService from '../../../src/services/jwt.service';
import { SubscriptionPlan } from '../../../src/models/types/organization.types';

// Use the real controller
import * as organizationController from '../../../src/controllers/organization.controller';

// ---- Mock services used by controller ----
jest.mock('../../../src/services/organization.service', () => ({
  createOrganization: jest.fn(),
  getOrganizationById: jest.fn(),
  getUserOrganizations: jest.fn(),
  updateOrganization: jest.fn(),
  deleteOrganization: jest.fn(),
  addUserToOrganization: jest.fn(),
  removeUserFromOrganization: jest.fn(),
  getOrganizationStorageStats: jest.fn()
}));

// IMPORTANT: listMembers does `await import('../services/membership.service')`
jest.mock('../../../src/services/membership.service', () => ({
  getOrganizationMembers: jest.fn()
}));

import * as organizationService from '../../../src/services/organization.service';
import * as membershipService from '../../../src/services/membership.service';
import type { Response } from 'supertest';

type ApiBody = {
  success?: boolean;
  message?: string;
  error?: string;
  organization?: { name?: string; plan?: SubscriptionPlan; settings?: { maxUsers?: number } };
  count?: number;
  memberships?: unknown[];
  stats?: { totalUsers?: number };
  members?: unknown[];
};

function bodyOf(res: Response): ApiBody {
  return (res.body as unknown) as ApiBody;
}

type AnyErr = unknown;

function buildTestApp(opts: { tokenToUserId: Record<string, string> }) {
  const app = express();
  app.use(express.json());

  // Minimal auth middleware for tests
  app.use((req: ExRequest & { user?: { id: string } }, res: ExResponse, next: NextFunction) => {
    const auth = req.header('authorization') || req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = auth.substring('Bearer '.length);
    const userId = opts.tokenToUserId[token];
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    req.user = { id: userId };
    return next();
  });

  // Mount routes that correspond to the controller (independent of src/app routing)
  const router = express.Router();

  router.post('/', organizationController.createOrganization);
  router.get('/', organizationController.listUserOrganizations);
  router.get('/:id', organizationController.getOrganization);
  router.put('/:id', organizationController.updateOrganization);
  router.delete('/:id', organizationController.deleteOrganization);

  router.post('/:id/members', organizationController.addMember);
  router.delete('/:id/members/:userId', organizationController.removeMember);

  router.get('/:id/stats', organizationController.getStorageStats);
  router.get('/:id/members', organizationController.listMembers);

  app.use('/api/organizations', router);

  // Minimal error handler (matches what your controller expects via next(err))
  // Ensures HttpError-like objects return their status codes.
  // Also ensures response shape has success:false and error message.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: AnyErr, _req: ExRequest, res: ExResponse, _next: NextFunction) => {
    const e = typeof err === 'object' && err !== null
      ? (err as { statusCode?: number; status?: number; code?: number; message?: string })
      : {};

    const status = e.statusCode || e.status || (typeof e.code === 'number' ? e.code : undefined) || 500;

    res.status(typeof status === 'number' ? status : 500).json({
      success: false,
      error: e.message || 'Internal Server Error'
    });
  });

  return app;
}

describe('OrganizationController Integration-ish Tests (mongo + supertest, mocked services)', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;
  let testUser2Id: mongoose.Types.ObjectId;
  let testToken: string;
  let testToken2: string;

  let app: ReturnType<typeof buildTestApp>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const owner = await User.create({
      name: 'Test Owner',
      email: 'owner@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true,
      storageUsed: 0
    });
    testUserId = owner._id;

    await new Promise(r => setTimeout(r, 50));

    testToken = jwtService.signToken({
      id: testUserId.toString(),
      email: 'owner@test.com',
      role: 'user'
    });

    const member = await User.create({
      name: 'Test Member',
      email: 'member@test.com',
      password: 'hashedpassword123',
      role: 'user',
      active: true,
      storageUsed: 0
    });
    testUser2Id = member._id;

    testToken2 = jwtService.signToken({
      id: testUser2Id.toString(),
      email: 'member@test.com',
      role: 'user'
    });

    app = buildTestApp({
      tokenToUserId: {
        [testToken]: testUserId.toString(),
        [testToken2]: testUser2Id.toString()
      }
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await User.deleteMany({ email: { $nin: ['owner@test.com', 'member@test.com'] } });
  });

  describe('POST /api/organizations', (): void => {
    it('should create a new organization (default plan FREE)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.createOrganization as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Test Organization',
        slug: 'test-organization',
        plan: SubscriptionPlan.FREE,
        owner: testUserId.toString(),
        members: [testUserId.toString()],
        active: true
      });

      const res = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Test Organization' });

      expect(res.status).toBe(201);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.message).toBe('Organization created successfully');
      expect(b.organization).toBeDefined();
      expect(b.organization?.name).toBe('Test Organization');
      expect(b.organization?.plan).toBe(SubscriptionPlan.FREE);

      expect(organizationService.createOrganization).toHaveBeenCalledWith({
        name: 'Test Organization',
        ownerId: testUserId.toString(),
        plan: SubscriptionPlan.FREE
      });
    });

    it('should create a new organization with provided plan', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.createOrganization as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Premium Org',
        slug: 'premium-org',
        plan: SubscriptionPlan.PREMIUM,
        owner: testUserId.toString(),
        members: [testUserId.toString()],
        active: true
      });

      const res = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Premium Org', plan: SubscriptionPlan.PREMIUM });

      expect(res.status).toBe(201);
      const b = bodyOf(res);
      expect(b.organization?.plan).toBe(SubscriptionPlan.PREMIUM);

      expect(organizationService.createOrganization).toHaveBeenCalledWith({
        name: 'Premium Org',
        ownerId: testUserId.toString(),
        plan: SubscriptionPlan.PREMIUM
      });
    });

    it('should fail when name is missing', async (): Promise<void> => {
      const res = await request(app)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
      expect(b.error || b.message).toMatch(/Organization name is required/i);
      expect(organizationService.createOrganization).not.toHaveBeenCalled();
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).post('/api/organizations').send({ name: 'X' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/organizations', (): void => {
    it('should list memberships returned by service', async (): Promise<void> => {
      (organizationService.getUserOrganizations as jest.Mock).mockResolvedValueOnce([
        { organization: { id: 'org1', name: 'Org 1' }, role: 'OWNER' },
        { organization: { id: 'org2', name: 'Org 2' }, role: 'MEMBER' }
      ]);

      const res = await request(app)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.count).toBe(2);
      expect(b.memberships).toHaveLength(2);

      expect(organizationService.getUserOrganizations).toHaveBeenCalledWith(testUserId.toString());
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).get('/api/organizations');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/organizations/:id', (): void => {
    it('should return org if requester is member (members populated objects)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Test Org',
        members: [{ _id: testUserId }]
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.organization?.name).toBe('Test Org');
    });

    it('should return org if requester is member (members raw ids)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Test Org',
        members: [testUserId]
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
    });

    it('should fail with 403 if requester is not a member', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Test Org',
        members: [{ _id: testUserId }]
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(res.status).toBe(403);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
      expect(b.error || b.message).toMatch(/Access denied to this organization/i);
    });

    it('should return 404 if organization not found', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(404);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });
  });

  describe('PUT /api/organizations/:id', (): void => {
    it('should update organization and return success', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.updateOrganization as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Updated Organization Name',
        settings: { maxUsers: 200 }
      });

      const res = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'Updated Organization Name', settings: { maxUsers: 200 } });

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.message).toBe('Organization updated successfully');
      expect(b.organization?.name).toBe('Updated Organization Name');
      expect(b.organization?.settings?.maxUsers).toBe(200);

      expect(organizationService.updateOrganization).toHaveBeenCalledWith(
        orgId,
        testUserId.toString(),
        { name: 'Updated Organization Name', settings: { maxUsers: 200 } }
      );
    });

    it('should bubble service error (HttpError 403)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.updateOrganization as jest.Mock).mockRejectedValueOnce({
        statusCode: 403,
        message: 'Only organization owner can update organization'
      });

      const res = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken2}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
      expect(b.error).toMatch(/Only organization owner/i);
    });

    it('should bubble service error (plain Error -> 500)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.updateOrganization as jest.Mock).mockRejectedValueOnce(
        new Error('Boom')
      );

      const res = await request(app)
        .put(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ name: 'X' });

      expect(res.status).toBe(500);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });
  });

  describe('DELETE /api/organizations/:id', (): void => {
    it('should delete (soft delete) organization and return success', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.deleteOrganization as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.message).toBe('Organization deleted successfully');

      expect(organizationService.deleteOrganization).toHaveBeenCalledWith(
        orgId,
        testUserId.toString()
      );
    });
  });

  describe('POST /api/organizations/:id/members', (): void => {
    it('should add member (requires userId in body)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.addUserToOrganization as jest.Mock).mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ userId: testUser2Id.toString() });

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.message).toBe('Member added successfully');

      expect(organizationService.addUserToOrganization).toHaveBeenCalledWith(
        orgId,
        testUser2Id.toString()
      );
    });

    it('should fail if userId missing', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({});
      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
      expect(b.error || b.message).toMatch(/User ID is required/i);
      expect(organizationService.addUserToOrganization).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/organizations/:id/members/:userId', (): void => {
    it('should remove member and return success', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.removeUserFromOrganization as jest.Mock).mockResolvedValueOnce(
        undefined
      );

      const res = await request(app)
        .delete(`/api/organizations/${orgId}/members/${testUser2Id.toString()}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.message).toBe('Member removed successfully');

      expect(organizationService.removeUserFromOrganization).toHaveBeenCalledWith(
        orgId,
        testUser2Id.toString()
      );
    });
  });

  describe('GET /api/organizations/:id/stats', (): void => {
    it('should return stats if requester is member', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Stats Org',
        members: [{ _id: testUserId }]
      });

      (organizationService.getOrganizationStorageStats as jest.Mock).mockResolvedValueOnce({
        totalUsers: 2,
        totalDocuments: 5,
        totalFolders: 3,
        totalStorageLimit: 123,
        usedStorage: 10,
        availableStorage: 113,
        storagePerUser: []
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.stats).toBeDefined();
      expect(b.stats?.totalUsers).toBe(2);

      expect(organizationService.getOrganizationStorageStats).toHaveBeenCalledWith(orgId);
    });

    it('should fail with 403 if requester is not member', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Stats Org',
        members: [{ _id: testUserId }]
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}/stats`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(res.status).toBe(403);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail with 404 if organization does not exist', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/organizations/${orgId}/stats`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(404);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });
  });

  describe('GET /api/organizations/:id/members', (): void => {
    it('should list members if requester is member (uses membership service)', async () => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Members Org',
        members: [{ _id: testUserId }, { _id: testUser2Id }]
      });

      (membershipService.getOrganizationMembers as jest.Mock).mockResolvedValueOnce([
        {
          id: 'm1',
          role: 'OWNER',
          user: { id: testUserId.toString(), name: 'Test Owner', email: 'owner@test.com' }
        },
        {
          id: 'm2',
          role: 'MEMBER',
          user: { id: testUser2Id.toString(), name: 'Test Member', email: 'member@test.com' }
        }
      ]);

      const res = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      expect(b.count).toBe(2);
      expect(b.members).toHaveLength(2);
      const bMembers = b.members as unknown[];
      const firstMember = bMembers[0] as Record<string, unknown>;
      expect(firstMember['user']).toBeDefined();
      const userObj = firstMember['user'] as Record<string, unknown>;
      expect(userObj['email']).toBeDefined();

      expect(membershipService.getOrganizationMembers).toHaveBeenCalledWith(orgId);
    });

    it('should fail with 403 if requester is not member', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();

      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce({
        id: orgId,
        _id: orgId,
        name: 'Members Org',
        members: [{ _id: testUserId }]
      });

      const res = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${testToken2}`);

      expect(res.status).toBe(403);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
      expect(membershipService.getOrganizationMembers).not.toHaveBeenCalled();
    });

    it('should fail with 404 if organization not found', async (): Promise<void> => {
      const orgId = new mongoose.Types.ObjectId().toString();
      (organizationService.getOrganizationById as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(404);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });
  });
});
