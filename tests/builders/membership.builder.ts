/**
 * Membership Builder
 * Constructor de membresías de prueba con patrón builder
 */

import mongoose from 'mongoose';
import { MembershipRole, MembershipStatus } from '../../src/models/membership.model';

interface MembershipData {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
  rootFolderId?: string;
  invitedBy?: string;
  joinedAt: Date;
}

export class MembershipBuilder {
  private membershipData: MembershipData = {
    userId: new mongoose.Types.ObjectId().toString(),
    organizationId: new mongoose.Types.ObjectId().toString(),
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date()
  };

  /**
   * Establece el usuario de la membresía
   */
  withUser(userId: string): MembershipBuilder {
    this.membershipData.userId = userId;
    return this;
  }

  /**
   * Establece la organización de la membresía
   */
  withOrganization(organizationId: string): MembershipBuilder {
    this.membershipData.organizationId = organizationId;
    return this;
  }

  /**
   * Establece el rol de la membresía
   */
  withRole(role: MembershipRole): MembershipBuilder {
    this.membershipData.role = role;
    return this;
  }

  /**
   * Establece el estatus de la membresía
   */
  withStatus(status: MembershipStatus): MembershipBuilder {
    this.membershipData.status = status;
    return this;
  }

  /**
   * Establece el rootFolder de la membresía
   */
  withRootFolder(rootFolderId: string): MembershipBuilder {
    this.membershipData.rootFolderId = rootFolderId;
    return this;
  }

  /**
   * Establece quién invitó al usuario
   */
  withInvitedBy(invitedBy: string): MembershipBuilder {
    this.membershipData.invitedBy = invitedBy;
    return this;
  }

  /**
   * Establece la fecha de unión
   */
  withJoinedAt(joinedAt: Date): MembershipBuilder {
    this.membershipData.joinedAt = joinedAt;
    return this;
  }

  /**
   * Configuración para owner de organización
   */
  asOwner(): MembershipBuilder {
    this.membershipData.role = MembershipRole.OWNER;
    this.membershipData.status = MembershipStatus.ACTIVE;
    return this;
  }

  /**
   * Configuración para admin de organización
   */
  asAdmin(): MembershipBuilder {
    this.membershipData.role = MembershipRole.ADMIN;
    this.membershipData.status = MembershipStatus.ACTIVE;
    return this;
  }

  /**
   * Configuración para miembro regular
   */
  asMember(): MembershipBuilder {
    this.membershipData.role = MembershipRole.MEMBER;
    this.membershipData.status = MembershipStatus.ACTIVE;
    return this;
  }

  /**
   * Configuración para viewer
   */
  asViewer(): MembershipBuilder {
    this.membershipData.role = MembershipRole.VIEWER;
    this.membershipData.status = MembershipStatus.ACTIVE;
    return this;
  }

  /**
   * Configuración para membresía pendiente
   */
  asPending(): MembershipBuilder {
    this.membershipData.status = MembershipStatus.PENDING;
    return this;
  }

  /**
   * Configuración para membresía suspendida
   */
  asSuspended(): MembershipBuilder {
    this.membershipData.status = MembershipStatus.SUSPENDED;
    return this;
  }

  /**
   * Construye los datos de la membresía
   */
  build(): MembershipData {
    return { ...this.membershipData };
  }

  /**
   * Construye los datos para usar con el servicio de membresía
   */
  buildForService(): { userId: string; organizationId: string; role: MembershipRole; invitedBy?: string } {
    return {
      userId: this.membershipData.userId,
      organizationId: this.membershipData.organizationId,
      role: this.membershipData.role,
      invitedBy: this.membershipData.invitedBy
    };
  }

  /**
   * Restablece el builder a valores por defecto
   */
  reset(): MembershipBuilder {
    this.membershipData = {
      userId: new mongoose.Types.ObjectId().toString(),
      organizationId: new mongoose.Types.ObjectId().toString(),
      role: MembershipRole.MEMBER,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date()
    };
    return this;
  }
}

/**
 * Factory method para crear un builder de membresía
 */
export const aMembership = (): MembershipBuilder => new MembershipBuilder();
