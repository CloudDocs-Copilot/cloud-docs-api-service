/**
 * Membership Fixtures
 * Datos de membresías predefinidos para tests
 */

import { MembershipRole, MembershipStatus } from '../../src/models/membership.model';

/**
 * Membresía básica como miembro
 */
export const basicMembership = {
  role: MembershipRole.MEMBER,
  status: MembershipStatus.ACTIVE,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Membresía como owner
 */
export const ownerMembership = {
  role: MembershipRole.OWNER,
  status: MembershipStatus.ACTIVE,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Membresía como admin
 */
export const adminMembership = {
  role: MembershipRole.ADMIN,
  status: MembershipStatus.ACTIVE,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Membresía como viewer
 */
export const viewerMembership = {
  role: MembershipRole.VIEWER,
  status: MembershipStatus.ACTIVE,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Membresía pendiente
 */
export const pendingMembership = {
  role: MembershipRole.MEMBER,
  status: MembershipStatus.PENDING,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Membresía suspendida
 */
export const suspendedMembership = {
  role: MembershipRole.MEMBER,
  status: MembershipStatus.SUSPENDED,
  joinedAt: new Date('2024-01-01'),
};

/**
 * Configuraciones por rol para permisos
 */
export const membershipPermissionsByRole = {
  [MembershipRole.OWNER]: {
    canUpdate: true,
    canDelete: true,
    canAddMembers: true,
    canRemoveMembers: true,
    canManageSettings: true,
    canViewStats: true,
  },
  [MembershipRole.ADMIN]: {
    canUpdate: false,
    canDelete: false,
    canAddMembers: true,
    canRemoveMembers: true,
    canManageSettings: false,
    canViewStats: true,
  },
  [MembershipRole.MEMBER]: {
    canUpdate: false,
    canDelete: false,
    canAddMembers: false,
    canRemoveMembers: false,
    canManageSettings: false,
    canViewStats: false,
  },
  [MembershipRole.VIEWER]: {
    canUpdate: false,
    canDelete: false,
    canAddMembers: false,
    canRemoveMembers: false,
    canManageSettings: false,
    canViewStats: false,
  }
};

/**
 * Datos de prueba para múltiples membresías
 */
export const multipleMembershipsTestData = {
  owner: {
    role: MembershipRole.OWNER,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2024-01-01'),
  },
  admin: {
    role: MembershipRole.ADMIN,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2024-01-02'),
  },
  member1: {
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2024-01-03'),
  },
  member2: {
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2024-01-04'),
  },
  viewer: {
    role: MembershipRole.VIEWER,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2024-01-05'),
  }
};