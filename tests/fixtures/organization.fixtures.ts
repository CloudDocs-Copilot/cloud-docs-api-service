/**
 * Organization Fixtures
 * Datos de organizaciones predefinidos para tests
 */

import { SubscriptionPlan } from '../../src/models/types/organization.types';

/**
 * Organización básica para tests
 */
export const basicOrganization = {
  name: 'Basic Test Organization',
  slug: 'basic-test-org',
  plan: SubscriptionPlan.FREE,
  active: true,
  settings: {
    maxStoragePerUser: 1073741824, // 1GB
    maxStorageTotal: 3221225472,   // 3GB
    allowedFileTypes: ['pdf', 'txt', 'doc', 'docx'],
    maxFileSize: 10485760,         // 10MB
    maxUsers: 3,
  }
};

/**
 * Organización para testing con límites reducidos
 */
export const testOrganization = {
  name: 'Test Organization',
  slug: 'test-org',
  plan: SubscriptionPlan.FREE,
  active: true,
  settings: {
    maxStoragePerUser: 1048576,  // 1MB para testing
    maxStorageTotal: 3145728,    // 3MB para testing  
    allowedFileTypes: ['txt', 'pdf'],
    maxFileSize: 524288,         // 512KB para testing
    maxUsers: 3,
  }
};

/**
 * Organización premium para tests avanzados
 */
export const premiumOrganization = {
  name: 'Premium Test Organization',
  slug: 'premium-test-org',
  plan: SubscriptionPlan.PREMIUM,
  active: true,
  settings: {
    maxStoragePerUser: 10737418240, // 10GB
    maxStorageTotal: 536870912000,  // 500GB
    allowedFileTypes: ['*'],
    maxFileSize: 104857600,         // 100MB
    maxUsers: 50,
  }
};

/**
 * Organización inactiva
 */
export const inactiveOrganization = {
  name: 'Inactive Test Organization',
  slug: 'inactive-test-org',
  plan: SubscriptionPlan.FREE,
  active: false,
  settings: {
    maxStoragePerUser: 1073741824,
    maxStorageTotal: 3221225472,
    allowedFileTypes: ['pdf', 'txt', 'doc', 'docx'],
    maxFileSize: 10485760,
    maxUsers: 3,
  }
};

/**
 * Configuraciones de organización por plan
 */
export const organizationSettingsByPlan = {
  [SubscriptionPlan.FREE]: {
    maxUsers: 3,
    maxStoragePerUser: 1073741824,
    maxStorageTotal: 3221225472,
    allowedFileTypes: ['pdf', 'txt', 'doc', 'docx'],
    maxFileSize: 10485760,
  },
  [SubscriptionPlan.BASIC]: {
    maxUsers: 100,
    maxStoragePerUser: 5368709120,
    maxStorageTotal: 53687091200,
    allowedFileTypes: ['*'],
    maxFileSize: 52428800,
  },
  [SubscriptionPlan.PREMIUM]: {
    maxUsers: 50,
    maxStoragePerUser: 10737418240,
    maxStorageTotal: 536870912000,
    allowedFileTypes: ['*'],
    maxFileSize: 104857600,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxUsers: -1,
    maxStoragePerUser: 53687091200,
    maxStorageTotal: -1,
    allowedFileTypes: ['*'],
    maxFileSize: 524288000,
  }
};

/**
 * Datos de prueba para estadísticas de almacenamiento
 */
export const storageStatsTestData = {
  users: [
    { id: 'user1', storageUsed: 300000000 }, // 300MB
    { id: 'user2', storageUsed: 500000000 }, // 500MB
    { id: 'user3', storageUsed: 100000000 }, // 100MB
  ],
  totalUsed: 900000000, // 900MB
  totalLimit: 2147483648, // 2GB (2 users * 1GB each for FREE plan)
};