import { request, app } from '../setup';
import { registerAndLogin } from '../helpers/auth.helper';
import { bodyOf } from '../helpers';
import Membership, { MembershipRole, MembershipStatus } from '../../src/models/membership.model';
import { Response } from 'supertest';

import User from '../../src/models/user.model';
import Organization from '../../src/models/organization.model';

/**
 * Tests de integración para endpoints de Membership
 * Prueba la gestión de membresías, invitaciones, roles y organización activa
 */
describe('Membership Endpoints', (): void => {
  let ownerCookies: string[];
  let ownerUserId: string;
  let adminCookies: string[];
  let adminUserId: string;
  let memberCookies: string[];
  let memberUserId: string;
  let organizationId: string;
  let secondOrgId: string;
  let adminMembershipId: string;
  let memberMembershipId: string;

  beforeEach(async (): Promise<void> => {
    // Use unique timestamp to avoid rate limiting across tests
    const timestamp = Date.now();

    // 1. Create owner user and first organization
    const ownerAuth = await registerAndLogin({
      name: 'Owner User',
      email: `owner-${timestamp}@test.com`,
      password: 'Owner@1234',
      createOrganization: false
    });
    ownerCookies = ownerAuth.cookies;
    ownerUserId = ownerAuth.userId;

    // 2. Create first organization as owner
    const orgResponse = await request(app)
      .post('/api/organizations')
      .set('Cookie', ownerCookies.join('; '))
      .send({ name: `Test Org ${timestamp}` })
      .expect(201);

    {
      const b = bodyOf<Record<string, unknown>>(orgResponse as Response) as Record<string, unknown>;
      const orgObj = b['organization'] as Record<string, unknown>;
      organizationId = (orgObj['id'] as string) || (orgObj['_id'] as string) || '';
    }

    // Upgrade organization to BASIC plan to allow more than 3 users for testing
    await Organization.findByIdAndUpdate(organizationId, {
      plan: 'basic',
      'settings.maxUsers': 10
    });

    // 3. Create admin user
    const adminAuth = await registerAndLogin({
      name: 'Admin User',
      email: `admin-${timestamp}@test.com`,
      password: 'Admin@1234',
      createOrganization: false
    });
    adminCookies = adminAuth.cookies;
    adminUserId = adminAuth.userId;

    // 4. Invite admin to organization and set role
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set('Cookie', ownerCookies.join('; '))
      .send({ userId: adminUserId })
      .expect(200);

    // Update admin role directly in DB
    const adminMembership = await Membership.findOne({
      user: adminUserId,
      organization: organizationId
    });
    if (adminMembership) {
      adminMembership.role = MembershipRole.ADMIN;
      await adminMembership.save();
      adminMembershipId = adminMembership._id.toString();
    }

    // 5. Create member user
    const memberAuth = await registerAndLogin({
      name: 'Member User',
      email: `member-${timestamp}@test.com`,
      password: 'Member@1234',
      createOrganization: false
    });
    memberCookies = memberAuth.cookies;
    memberUserId = memberAuth.userId;

    // 6. Invite member to organization
    await request(app)
      .post(`/api/organizations/${organizationId}/members`)
      .set('Cookie', ownerCookies.join('; '))
      .send({ userId: memberUserId })
      .expect(200);

    const memberMembership = await Membership.findOne({
      user: memberUserId,
      organization: organizationId
    });
    if (memberMembership) {
      memberMembershipId = memberMembership._id.toString();
    }

    // 7. Create second organization for testing
    const secondOrgResponse = await request(app)
      .post('/api/organizations')
      .set('Cookie', ownerCookies.join('; '))
      .send({ name: `Second Org ${timestamp}` })
      .expect(201);

    {
      const b = bodyOf<Record<string, unknown>>(secondOrgResponse as Response) as Record<string, unknown>;
      const orgObj = b['organization'] as Record<string, unknown>;
      secondOrgId = (orgObj['id'] as string) || (orgObj['_id'] as string) || '';
    }
  });

  describe('GET /api/memberships/my-organizations', (): void => {
    it('should return all organizations where user is member', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/memberships/my-organizations')
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      {
        const b = bodyOf<Record<string, unknown>>(response);
        expect(b['success']).toBe(true);
        expect(b['data']).toBeDefined();
        expect(b['count']).toBeDefined();
      }
      const b = bodyOf<Record<string, unknown>>(response);
      expect(Array.isArray(b['data'])).toBe(true);
      expect(((b['data'] as unknown[]) || []).length).toBeGreaterThanOrEqual(2); // Owner is in 2 orgs
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app).get('/api/memberships/my-organizations').expect(401);

      expect(bodyOf<Record<string, unknown>>(response)['error']).toBeDefined();
    });
  });

  describe('GET /api/memberships/active-organization', (): void => {
    it('should return active organization for user', async (): Promise<void> => {
      const response = await request(app)
        .get('/api/memberships/active-organization')
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      const b = bodyOf<Record<string, unknown>>(response);
      expect(b['success']).toBe(true);
      expect(b['organizationId']).toBeDefined();
      expect(b['organizationId']).toBe(organizationId);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app).get('/api/memberships/active-organization').expect(401);

      expect(bodyOf<Record<string, unknown>>(response)['error']).toBeDefined();
    });
  });

  describe('POST /api/memberships/set-active', (): void => {
    it('should switch active organization successfully', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/memberships/set-active')
        .set('Cookie', ownerCookies.join('; '))
        .send({ organizationId: secondOrgId })
        .expect(200);

      const b = bodyOf<Record<string, unknown>>(response);
      expect(b['message']).toBeDefined();
      expect(b['activeOrganization']).toBeDefined();
      expect(b['activeOrganization']).toBe(secondOrgId);

      // Verify in database
      const user = await User.findById(ownerUserId);
      expect(user?.organization?.toString()).toBe(secondOrgId);
    });

    it('should fail without organizationId', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/memberships/set-active')
        .set('Cookie', ownerCookies.join('; '))
        .send({})
        .expect(400);

      expect(bodyOf<Record<string, unknown>>(response)['error']).toBeDefined();
    });

    it('should fail for organization where user is not member', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/memberships/set-active')
        .set('Cookie', memberCookies.join('; '))
        .send({ organizationId: secondOrgId })
        .expect(403);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .post('/api/memberships/set-active')
        .send({ organizationId: organizationId })
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });
  });

  describe('GET /api/memberships/organization/:organizationId/members', (): void => {
    it('should return all members of organization', async (): Promise<void> => {
      const response = await request(app)
        .get(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      const b = bodyOf<Record<string, unknown>>(response);
      expect(b['success']).toBe(true);
      expect(b['count']).toBeDefined();
      expect(Array.isArray(b['data'])).toBe(true);
      expect((b['count'] as number) || (b['data'] as unknown[]).length).toBeGreaterThanOrEqual(3); // owner, admin, member
    });

    it('should fail for non-member user', async (): Promise<void> => {
      const nonMemberAuth = await registerAndLogin({
        name: 'Non Member',
        email: 'nonmember',
        password: 'NonMember@1234',
        createOrganization: false
      });

      const response = await request(app)
        .get(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', nonMemberAuth.cookies.join('; '))
        .expect(403);

      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .get(`/api/memberships/organization/${organizationId}/members`)
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });
  });

  describe('POST /api/memberships/organization/:organizationId/members', (): void => {
    it('should invite user to organization successfully (as owner)', async (): Promise<void> => {
      const newUserAuth = await registerAndLogin({
        name: 'New User',
        email: 'newuser',
        password: 'NewUser@1234',
        createOrganization: false
      });

      const response = await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: newUserAuth.userId, role: 'member' })
        .expect(201);

      // La API ahora devuelve 'invitation' porque crea invitaciones PENDING
      const body = bodyOf<Record<string, unknown>>(response as Response) as Record<string, unknown>;
      expect(body['invitation']).toBeDefined();
      const invitation = body['invitation'] as Record<string, unknown>;
      expect(invitation['role']).toBe('member');
      expect(invitation['status']).toBe('pending');
    });

    it('should invite user with admin role (as owner)', async (): Promise<void> => {
      // Primero actualizar la segunda organización a plan BASIC para permitir admins adicionales
      await Organization.findByIdAndUpdate(secondOrgId, {
        plan: 'basic',
        'settings.maxUsers': 10
      });

      const newAdminAuth = await registerAndLogin({
        name: 'New Admin',
        email: 'newadmin',
        password: 'NewAdmin@1234',
        createOrganization: false
      });

      const response = await request(app)
        .post(`/api/memberships/organization/${secondOrgId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: newAdminAuth.userId, role: 'admin' })
        .expect(201);

      // La API ahora devuelve 'invitation' porque crea invitaciones PENDING
      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('invitation');
      const inv = bodyOf<Record<string, unknown>>(response)['invitation'] as Record<string, unknown>;
      expect(inv['role']).toBe('admin');
      expect(inv['status']).toBe('pending');
    });

    it('should fail without userId', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ role: 'member' })
        .expect(400);

      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('error');
    });

    it('should fail if user already member', async (): Promise<void> => {
      const response = await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: adminUserId })
        .expect(409);

      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const tempUserAuth = await registerAndLogin({
        name: 'Temp User',
        email: 'temp',
        password: 'Temp@1234',
        createOrganization: false
      });

      const response = await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .send({ userId: tempUserAuth.userId })
        .expect(401);

      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('error');
    });
  });

  describe('PATCH /api/memberships/organization/:organizationId/members/:membershipId', (): void => {
    it('should update member role successfully (as owner)', async (): Promise<void> => {
      expect(memberMembershipId).toBeDefined();

      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${memberMembershipId}`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ role: 'admin' })
        .expect(200);

      expect(bodyOf<Record<string, unknown>>(response)).toHaveProperty('membership');
      const mem = bodyOf<Record<string, unknown>>(response)['membership'] as Record<string, unknown>;
      expect(mem['role']).toBe('admin');

      // Verify in database
      const membership = await Membership.findById(memberMembershipId);
      expect(membership?.role).toBe(MembershipRole.ADMIN);
    });

    it('should fail without role in body', async (): Promise<void> => {
      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${memberMembershipId}`)
        .set('Cookie', ownerCookies.join('; '))
        .send({})
        .expect(400);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail when trying to change owner role', async (): Promise<void> => {
      const ownerMembership = await Membership.findOne({
        user: ownerUserId,
        organization: organizationId
      });

      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${ownerMembership?._id}`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ role: 'member' })
        .expect(400); // Updated expected status code to 400

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail for non-owner user', async (): Promise<void> => {
      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${memberMembershipId}`)
        .set('Cookie', adminCookies.join('; '))
        .send({ role: 'member' })
        .expect(403);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail with invalid membershipId', async (): Promise<void> => {
      const invalidId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${invalidId}`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ role: 'member' })
        .expect(404);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .patch(`/api/memberships/organization/${organizationId}/members/${memberMembershipId}`)
        .send({ role: 'member' })
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });
  });

  describe('DELETE /api/memberships/organization/:organizationId/members/:membershipId', (): void => {
    it('should remove member successfully (as owner)', async (): Promise<void> => {
      // First invite a new user to remove
      const toRemoveAuth = await registerAndLogin({
        name: 'To Remove',
        email: 'toremove',
        password: 'ToRemove@1234',
        createOrganization: false
      });

      await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: toRemoveAuth.userId })
        .expect(201);

      const toRemoveMembership = await Membership.findOne({
        user: toRemoveAuth.userId,
        organization: organizationId
      });

      const response = await request(app)
        .delete(
          `/api/memberships/organization/${organizationId}/members/${toRemoveMembership?._id}`
        )
        .set('Cookie', ownerCookies.join('; '))
        .expect(200);

      expect(bodyOf(response)).toHaveProperty('message');

      // Verify membership is permanently deleted (not suspended)
      const membership = await Membership.findById(toRemoveMembership?._id);
      expect(membership).toBeNull();
    });

    it('should remove member successfully (as admin)', async (): Promise<void> => {
      // First invite a new user to remove
      const toRemoveAuth2 = await registerAndLogin({
        name: 'To Remove 2',
        email: 'toremove2',
        password: 'ToRemove@1234',
        createOrganization: false
      });

      await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: toRemoveAuth2.userId })
        .expect(201);

      const toRemoveMembership = await Membership.findOne({
        user: toRemoveAuth2.userId,
        organization: organizationId
      });

      const response = await request(app)
        .delete(
          `/api/memberships/organization/${organizationId}/members/${toRemoveMembership?._id}`
        )
        .set('Cookie', adminCookies.join('; '))
        .expect(200);

      expect(bodyOf(response)).toHaveProperty('message');
    });

    it('should fail when trying to remove owner', async (): Promise<void> => {
      const ownerMembership = await Membership.findOne({
        user: ownerUserId,
        organization: organizationId
      });

      const response = await request(app)
        .delete(`/api/memberships/organization/${organizationId}/members/${ownerMembership?._id}`)
        .set('Cookie', adminCookies.join('; '))
        .expect(400);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail for regular member', async (): Promise<void> => {
      const response = await request(app)
        .delete(`/api/memberships/organization/${organizationId}/members/${adminMembershipId}`)
        .set('Cookie', memberCookies.join('; '))
        .expect(403);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail with invalid membershipId', async (): Promise<void> => {
      const invalidId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/memberships/organization/${organizationId}/members/${invalidId}`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(404);

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .delete(`/api/memberships/organization/${organizationId}/members/${memberMembershipId}`)
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });
  });

  describe('DELETE /api/memberships/:organizationId/leave', (): void => {
    it('should allow member to leave organization', async (): Promise<void> => {
      // Create a new user to leave
      const toLeaveAuth = await registerAndLogin({
        name: 'To Leave',
        email: 'toleave',
        password: 'ToLeave@1234',
        createOrganization: false
      });

      // Invitar al usuario
      await request(app)
        .post(`/api/memberships/organization/${organizationId}/members`)
        .set('Cookie', ownerCookies.join('; '))
        .send({ userId: toLeaveAuth.userId })
        .expect(201);

      // Aceptar la invitación para que tenga membresía activa
      const pendingMembership = await Membership.findOne({
        user: toLeaveAuth.userId,
        organization: organizationId,
        status: MembershipStatus.PENDING
      });

      if (pendingMembership) {
        await request(app)
          .post(`/api/memberships/invitations/${pendingMembership._id}/accept`)
          .set('Cookie', toLeaveAuth.cookies.join('; '))
          .expect(200);
      }

      const response = await request(app)
        .delete(`/api/memberships/${organizationId}/leave`)
        .set('Cookie', toLeaveAuth.cookies.join('; '))
        .expect(200);

      expect(bodyOf(response)).toHaveProperty('message');

      // Verify membership is permanently deleted (not suspended)
      const membership = await Membership.findOne({
        user: toLeaveAuth.userId,
        organization: organizationId
      });
      expect(membership).toBeNull();
    });

    it('should fail when owner tries to leave', async (): Promise<void> => {
      const response = await request(app)
        .delete(`/api/memberships/${organizationId}/leave`)
        .set('Cookie', ownerCookies.join('; '))
        .expect(400); // Updated expected status code to 400

      expect(bodyOf(response)).toHaveProperty('error');
    });

    it('should fail without authentication', async (): Promise<void> => {
      const response = await request(app)
        .delete(`/api/memberships/${organizationId}/leave`)
        .expect(401);

      expect(bodyOf(response)).toHaveProperty('error');
    });
  });
});
