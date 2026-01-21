/**
 * Organization Test Helper
 * Helper para configurar organizaciones con membresías correctamente
 */

import * as organizationService from '../../src/services/organization.service';
import User from '../../src/models/user.model';
import Organization from '../../src/models/organization.model';
import Membership, { MembershipRole, MembershipStatus } from '../../src/models/membership.model';
import { anOrganization } from '../builders/organization.builder';
import { testOrganization } from '../fixtures/organization.fixtures';

export interface OrganizationTestSetup {
  organization: any;
  owner: any;
  ownerMembership: any;
  additionalUsers?: any[];
  additionalMemberships?: any[];
}

/**
 * Crea una organización completa con owner y membresías
 */
export async function createCompleteOrganization(options?: {
  orgName?: string;
  ownerName?: string;
  ownerEmail?: string;
  additionalMembers?: Array<{name: string, email: string, role?: MembershipRole}>;
}): Promise<OrganizationTestSetup> {
  
  // Generar email único para evitar duplicados entre tests
  const timestamp = Date.now();
  const defaultOwnerEmail = `owner-${timestamp}@test.com`;
  
  // 1. Crear usuario owner sin organización
  const owner = await User.create({
    name: options?.ownerName || 'Test Owner',
    email: options?.ownerEmail || defaultOwnerEmail,
    password: 'hashedpassword123',
    role: 'admin',
  });

  // 2. Crear organización usando el servicio (esto automáticamente crea membership para owner)
  const orgData = anOrganization()
    .withName(options?.orgName || testOrganization.name)
    .withOwner(owner._id.toString())
    .buildForService();

  const organization = await organizationService.createOrganization(orgData);

  // 3. Buscar la membresía del owner que se creó automáticamente
  const ownerMembership = await Membership.findOne({
    user: owner._id,
    organization: organization._id,
    role: MembershipRole.OWNER,
    status: MembershipStatus.ACTIVE,
  });

  if (!ownerMembership) {
    throw new Error('Owner membership not found after organization creation');
  }

  const result: OrganizationTestSetup = {
    organization,
    owner,
    ownerMembership,
  };

  // 4. Crear usuarios adicionales si se especificaron
  if (options?.additionalMembers?.length) {
    const additionalUsers = [];
    const additionalMemberships = [];

    for (let i = 0; i < options.additionalMembers.length; i++) {
      const member = options.additionalMembers[i];
      
      // Crear usuario sin organización con email único
      const user = await User.create({
        name: member.name,
        email: `${member.email.split('@')[0]}-${timestamp}-${i}@test.com`,
        password: 'hashedpassword123',
        role: 'user',
      });
      
      // Usar addUserToOrganization en lugar de createMembership directamente
      // para asegurar que todos los pasos se ejecuten correctamente
      await organizationService.addUserToOrganization(
        organization._id.toString(),
        user._id.toString()
      );

      // Buscar la membresía creada
      const membership = await Membership.findOne({
        user: user._id,
        organization: organization._id,
        status: MembershipStatus.ACTIVE,
      });

      if (!membership) {
        throw new Error(`Membership not found for user ${user.name}`);
      }

      additionalUsers.push(user);
      additionalMemberships.push(membership);
    }

    result.additionalUsers = additionalUsers;
    result.additionalMemberships = additionalMemberships;
  }

  return result;
}

/**
 * Crea un usuario sin organización (para tests de fallos)
 */
export async function createUserWithoutOrganization(options?: {
  name?: string;
  email?: string;
}): Promise<any> {
  // Generar email único
  const timestamp = Date.now();
  const defaultEmail = `noorg-${timestamp}@test.com`;
  
  return await User.create({
    name: options?.name || 'User Without Org',
    email: options?.email || defaultEmail,
    password: 'hashedpassword123',
    role: 'user',
  });
}

/**
 * Verifica que una organización tenga las propiedades esperadas
 */
export function assertOrganizationProperties(
  organization: any,
  expectedProps: {
    name?: string;
    slug?: string;
    ownerId?: string;
    memberCount?: number;
    active?: boolean;
  }
) {
  if (expectedProps.name) {
    expect(organization.name).toBe(expectedProps.name);
  }
  if (expectedProps.slug) {
    expect(organization.slug).toBe(expectedProps.slug);
  }
  if (expectedProps.ownerId) {
    expect(organization.owner.toString()).toBe(expectedProps.ownerId);
  }
  if (expectedProps.memberCount !== undefined) {
    expect(organization.members).toHaveLength(expectedProps.memberCount);
  }
  if (expectedProps.active !== undefined) {
    expect(organization.active).toBe(expectedProps.active);
  }
}

/**
 * Verifica que un usuario tenga organización y rootFolder configurados
 */
export function assertUserOrganizationSetup(
  user: any,
  expectedOrgId: string
) {
  expect(user.organization?.toString()).toBe(expectedOrgId);
  expect(user.rootFolder).toBeDefined();
}

/**
 * Verifica que una membresía tenga las propiedades esperadas
 */
export function assertMembershipProperties(
  membership: any,
  expectedProps: {
    userId?: string;
    organizationId?: string;
    role?: MembershipRole;
    status?: MembershipStatus;
    hasRootFolder?: boolean;
  }
) {
  if (expectedProps.userId) {
    expect(membership.user.toString()).toBe(expectedProps.userId);
  }
  if (expectedProps.organizationId) {
    expect(membership.organization.toString()).toBe(expectedProps.organizationId);
  }
  if (expectedProps.role) {
    expect(membership.role).toBe(expectedProps.role);
  }
  if (expectedProps.status) {
    expect(membership.status).toBe(expectedProps.status);
  }
  if (expectedProps.hasRootFolder !== undefined) {
    if (expectedProps.hasRootFolder) {
      expect(membership.rootFolder).toBeDefined();
    } else {
      expect(membership.rootFolder).toBeUndefined();
    }
  }
}

/**
 * Limpia todos los datos relacionados con organizaciones y membresías
 */
export async function cleanupOrganizationData() {
  await Organization.deleteMany({});
  await Membership.deleteMany({});
  // Eliminar usuarios completamente en lugar de solo actualizar campos
  await User.deleteMany({});
}