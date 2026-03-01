import { request, app } from '../setup';
import { registerAndLogin } from '../helpers/auth.helper';
import { bodyOf } from '../helpers';
import type { Response } from 'supertest';
import Membership, { MembershipStatus } from '../../src/models/membership.model';
import Organization from '../../src/models/organization.model';
import Folder from '../../src/models/folder.model';

/**
 * Tests de integración para flujo de invitaciones multi-organización
 * Prueba que un usuario pueda pertenecer a múltiples organizaciones
 * y que los rootFolders se creen correctamente sin conflictos
 */
describe('Multi-Organization Membership Flow', (): void => {
  let userACookies: string[];
  let userAId: string;
  let userBCookies: string[];
  let userBId: string;
  let org1Id: string;
  let org2Id: string;
  let org1Slug: string;
  let org2Slug: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    // 1. Crear Usuario A (creará la primera organización)
    const userA = await registerAndLogin({
      name: 'User A',
      email: `usera-${timestamp}@test.com`,
      password: 'UserA@1234',
      createOrganization: true
    });
    userACookies = userA.cookies;
    userAId = userA.userId;

    // Obtener la organización creada por Usuario A
    const org1 = await Organization.findOne({ owner: userAId });
    if (!org1) throw new Error('Organization 1 not found');
    org1Id = org1._id.toString();
    org1Slug = org1.slug;

    // Actualizar plan para permitir más usuarios
    await Organization.findByIdAndUpdate(org1Id, {
      plan: 'basic',
      'settings.maxUsers': 10
    });

    // 2. Crear Usuario B (creará la segunda organización)
    const userB = await registerAndLogin({
      name: 'User B',
      email: `userb-${timestamp}@test.com`,
      password: 'UserB@1234',
      createOrganization: true
    });
    userBCookies = userB.cookies;
    userBId = userB.userId;

    // Obtener la organización creada por Usuario B
    const org2 = await Organization.findOne({ owner: userBId });
    if (!org2) throw new Error('Organization 2 not found');
    org2Id = org2._id.toString();
    org2Slug = org2.slug;

    // Actualizar plan para permitir más usuarios
    await Organization.findByIdAndUpdate(org2Id, {
      plan: 'basic',
      'settings.maxUsers': 10
    });
  });

  describe('User can be invited to multiple organizations', (): void => {
    it('should allow User A (who owns Org1) to be invited to Org2', async () => {
      // User B invita a User A a su organización (Org2)
      const inviteResponse = await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      const inviteBody = bodyOf(inviteResponse as unknown as Response) as Record<string, unknown>;
      expect(inviteBody['success']).toBe(true);
      expect(inviteBody['invitation']).toBeDefined();

      // Verificar que la invitación está en estado PENDING
      const invitation = await Membership.findOne({
        user: userAId,
        organization: org2Id
      });

      expect(invitation).toBeDefined();
      expect(invitation?.status).toBe(MembershipStatus.PENDING);
      expect(invitation?.rootFolder).toBeUndefined();
    });

    it('should create unique rootFolders when User A accepts invitation to Org2', async (): Promise<void> => {
      // User B invita a User A
      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      const invitation = await Membership.findOne({
        user: userAId,
        organization: org2Id
      });
      expect(invitation).toBeDefined();

      // User A acepta la invitación
      const acceptResponse = await request(app)
        .post(`/api/memberships/invitations/${invitation!._id}/accept`)
        .set('Cookie', userACookies.join('; '))
        .expect(200);

      const acceptBody = bodyOf(acceptResponse as unknown as Response) as Record<string, unknown>;
      expect(acceptBody['success']).toBe(true);
      const membership = acceptBody['membership'] as Record<string, unknown>;
      expect(membership['status']).toBe(MembershipStatus.ACTIVE);

      // Verificar que User A tiene dos rootFolders (uno por organización)
      const rootFolders = await Folder.find({
        owner: userAId,
        isRoot: true
      });

      expect(rootFolders).toHaveLength(2);

      // Verificar que los nombres son únicos (incluyen el slug de la org)
      const folderNames = rootFolders.map(f => f.name);
      expect(new Set(folderNames).size).toBe(2); // Sin duplicados

      // Verificar formato: root_{orgSlug}_{userId}
      const folder1 = rootFolders.find(f => f.organization?.toString() === org1Id);
      const folder2 = rootFolders.find(f => f.organization?.toString() === org2Id);

      expect(folder1).toBeDefined();
      expect(folder2).toBeDefined();

      // Verificar que los nombres incluyen el slug
      expect(folder1?.name).toContain(org1Slug);
      expect(folder1?.name).toContain(userAId);
      expect(folder2?.name).toContain(org2Slug);
      expect(folder2?.name).toContain(userAId);

      // Verificar que los paths son diferentes
      expect(folder1?.path).not.toBe(folder2?.path);
      expect(folder1?.path).toContain(org1Slug);
      expect(folder2?.path).toContain(org2Slug);
    });

    it('should not allow duplicate invitations to the same organization', async (): Promise<void> => {
      // Primera invitación
      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      // Intentar enviar segunda invitación a la misma org
      const duplicateResponse = await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(409);

      const duplicateBody = bodyOf(duplicateResponse as unknown as Response) as Record<string, unknown>;
      expect(duplicateBody['success']).toBe(false);
    });

    it('should prevent creating rootFolder if already active in organization', async (): Promise<void> => {
      // User B invita a User A
      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      const invitation = await Membership.findOne({
        user: userAId,
        organization: org2Id
      });

      // User A acepta
      await request(app)
        .post(`/api/memberships/invitations/${invitation!._id}/accept`)
        .set('Cookie', userACookies.join('; '))
        .expect(200);

      // Intentar aceptar de nuevo debería fallar
      const retryResponse = await request(app)
        .post(`/api/memberships/invitations/${invitation!._id}/accept`)
        .set('Cookie', userACookies.join('; '))
        .expect(400);

      const retryBody = bodyOf(retryResponse as unknown as Response) as Record<string, unknown>;
      expect(retryBody['success']).toBe(false);
    });
  });

  describe('RootFolder naming includes organization slug', (): void => {
    it('should create rootFolder with format root_{orgSlug}_{userId}', async (): Promise<void> => {
      // Verificar rootFolder de User A en Org1
      const rootFolder = await Folder.findOne({
        owner: userAId,
        organization: org1Id,
        isRoot: true
      });

      expect(rootFolder).toBeDefined();
      expect(rootFolder?.name).toMatch(
        new RegExp(`^root_${org1Slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_`)
      );
      expect(rootFolder?.name).toContain(userAId);
    });

    it('should have different rootFolder names for same user in different orgs', async (): Promise<void> => {
      // Invitar a User A a Org2 y aceptar
      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      const invitation = await Membership.findOne({
        user: userAId,
        organization: org2Id
      });

      await request(app)
        .post(`/api/memberships/invitations/${invitation!._id}/accept`)
        .set('Cookie', userACookies.join('; '))
        .expect(200);

      // Obtener ambos rootFolders
      const org1RootFolder = await Folder.findOne({
        owner: userAId,
        organization: org1Id,
        isRoot: true
      });

      const org2RootFolder = await Folder.findOne({
        owner: userAId,
        organization: org2Id,
        isRoot: true
      });

      expect(org1RootFolder).toBeDefined();
      expect(org2RootFolder).toBeDefined();

      // Los nombres deben ser diferentes
      expect(org1RootFolder?.name).not.toBe(org2RootFolder?.name);

      // Ambos deben contener el userId pero con diferentes slugs
      expect(org1RootFolder?.name).toContain(userAId);
      expect(org2RootFolder?.name).toContain(userAId);
      expect(org1RootFolder?.name).toContain(org1Slug);
      expect(org2RootFolder?.name).toContain(org2Slug);
    });
  });

  describe('Cross-organization invitation workflow', (): void => {
    it('should allow bidirectional invitations (A invites B, B invites A)', async () => {
      // User A (owner Org1) invita a User B
      await request(app)
        .post(`/api/memberships/organization/${org1Id}/members`)
        .set('Cookie', userACookies.join('; '))
        .send({ userId: userBId, role: 'member' })
        .expect(201);

      // User B (owner Org2) invita a User A
      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      // Verificar que ambas invitaciones existen
      const invitationBtoOrg1 = await Membership.findOne({
        user: userBId,
        organization: org1Id,
        status: MembershipStatus.PENDING
      });

      const invitationAtoOrg2 = await Membership.findOne({
        user: userAId,
        organization: org2Id,
        status: MembershipStatus.PENDING
      });

      expect(invitationBtoOrg1).toBeDefined();
      expect(invitationAtoOrg2).toBeDefined();
    });

    it('should allow both users to accept and have 2 organizations each', async (): Promise<void> => {
      // Crear invitaciones bidireccionales
      await request(app)
        .post(`/api/memberships/organization/${org1Id}/members`)
        .set('Cookie', userACookies.join('; '))
        .send({ userId: userBId, role: 'member' })
        .expect(201);

      await request(app)
        .post(`/api/memberships/organization/${org2Id}/members`)
        .set('Cookie', userBCookies.join('; '))
        .send({ userId: userAId, role: 'member' })
        .expect(201);

      // User B acepta invitación a Org1
      const invitationB = await Membership.findOne({
        user: userBId,
        organization: org1Id
      });

      await request(app)
        .post(`/api/memberships/invitations/${invitationB!._id}/accept`)
        .set('Cookie', userBCookies.join('; '))
        .expect(200);

      // User A acepta invitación a Org2
      const invitationA = await Membership.findOne({
        user: userAId,
        organization: org2Id
      });

      await request(app)
        .post(`/api/memberships/invitations/${invitationA!._id}/accept`)
        .set('Cookie', userACookies.join('; '))
        .expect(200);

      // Verificar que cada usuario tiene 2 membresías activas
      const userAMemberships = await Membership.find({
        user: userAId,
        status: MembershipStatus.ACTIVE
      });

      const userBMemberships = await Membership.find({
        user: userBId,
        status: MembershipStatus.ACTIVE
      });

      expect(userAMemberships).toHaveLength(2);
      expect(userBMemberships).toHaveLength(2);

      // Verificar que cada usuario tiene 2 rootFolders
      const userARootFolders = await Folder.find({
        owner: userAId,
        isRoot: true
      });

      const userBRootFolders = await Folder.find({
        owner: userBId,
        isRoot: true
      });

      expect(userARootFolders).toHaveLength(2);
      expect(userBRootFolders).toHaveLength(2);
    });
  });
});
