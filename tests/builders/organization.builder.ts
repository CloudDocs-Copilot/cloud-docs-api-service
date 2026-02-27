/**
 * Organization Builder
 * Constructor de organizaciones de prueba con patrón builder
 */

import mongoose from 'mongoose';
import { SubscriptionPlan } from '../../src/models/types/organization.types';

interface OrganizationData {
  name: string;
  slug?: string;
  ownerId: string;
  plan: SubscriptionPlan;
  active: boolean;
  members?: string[];
  settings?: {
    maxStoragePerUser?: number;
    maxStorageTotal?: number;
    allowedFileTypes?: string[];
    maxFileSize?: number;
    maxUsers?: number;
  };
}

export class OrganizationBuilder {
  private orgData: OrganizationData = {
    name: 'Test Organization',
    ownerId: new mongoose.Types.ObjectId().toString(),
    plan: SubscriptionPlan.FREE,
    active: true
  };

  /**
   * Establece el nombre de la organización
   */
  withName(name: string): OrganizationBuilder {
    this.orgData.name = name;
    return this;
  }

  /**
   * Establece el slug de la organización
   */
  withSlug(slug: string): OrganizationBuilder {
    this.orgData.slug = slug;
    return this;
  }

  /**
   * Establece el owner de la organización
   */
  withOwner(ownerId: string): OrganizationBuilder {
    this.orgData.ownerId = ownerId;
    return this;
  }

  /**
   * Establece el plan de suscripción
   */
  withPlan(plan: SubscriptionPlan): OrganizationBuilder {
    this.orgData.plan = plan;
    return this;
  }

  /**
   * Establece si la organización está activa
   */
  withActive(active: boolean): OrganizationBuilder {
    this.orgData.active = active;
    return this;
  }

  /**
   * Establece los miembros de la organización
   */
  withMembers(members: string[]): OrganizationBuilder {
    this.orgData.members = members;
    return this;
  }

  /**
   * Establece configuraciones personalizadas
   */
  withSettings(settings: OrganizationData['settings']): OrganizationBuilder {
    this.orgData.settings = settings;
    return this;
  }

  /**
   * Configuración para testing con límites reducidos
   */
  withTestSettings(): OrganizationBuilder {
    this.orgData.settings = {
      maxStoragePerUser: 1048576, // 1MB para testing
      maxStorageTotal: 3145728, // 3MB para testing
      allowedFileTypes: ['txt', 'pdf'],
      maxFileSize: 524288, // 512KB para testing
      maxUsers: 3
    };
    return this;
  }

  /**
   * Construye los datos de la organización
   */
  build(): OrganizationData {
    return { ...this.orgData };
  }

  /**
   * Construye solo los datos requeridos para el servicio
   */
  buildForService(): { name: string; ownerId: string; settings?: OrganizationData['settings'] } {
    return {
      name: this.orgData.name,
      ownerId: this.orgData.ownerId,
      settings: this.orgData.settings
    };
  }

  /**
   * Restablece el builder a valores por defecto
   */
  reset(): OrganizationBuilder {
    this.orgData = {
      name: 'Test Organization',
      ownerId: new mongoose.Types.ObjectId().toString(),
      plan: SubscriptionPlan.FREE,
      active: true
    };
    return this;
  }
}

/**
 * Factory method para crear un builder de organización
 */
export const anOrganization = (): OrganizationBuilder => new OrganizationBuilder();
