import { Document, Types } from 'mongoose';

/**
 * Planes de suscripción disponibles
 */
export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

/**
 * Límites por plan (hardcoded por ahora, fácil de migrar a BD)
 */
export const PLAN_LIMITS = {
  [SubscriptionPlan.FREE]: {
    maxUsers: 3,
    maxStoragePerUser: 1073741824, // 1GB
    maxStorageTotal: 3221225472, // 3GB total
    allowedFileTypes: ['pdf', 'txt', 'doc', 'docx'],
    maxFileSize: 10485760 // 10MB
  },
  [SubscriptionPlan.BASIC]: {
    maxUsers: 100,
    maxStoragePerUser: 5368709120, // 5GB
    maxStorageTotal: 53687091200, // 50GB total
    allowedFileTypes: ['*'],
    maxFileSize: 52428800 // 50MB
  },
  [SubscriptionPlan.PREMIUM]: {
    maxUsers: 50,
    maxStoragePerUser: 10737418240, // 10GB
    maxStorageTotal: 536870912000, // 500GB total
    allowedFileTypes: ['*'],
    maxFileSize: 104857600 // 100MB
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxUsers: -1, // ilimitado
    maxStoragePerUser: 53687091200, // 50GB
    maxStorageTotal: -1, // ilimitado
    allowedFileTypes: ['*'],
    maxFileSize: 524288000 // 500MB
  }
};

/**
 * Interface para las configuraciones de una organización
 */
export interface IOrganizationSettings {
  /** Límite de almacenamiento por usuario en bytes */
  maxStoragePerUser: number;
  /** Tipos de archivo permitidos (MIME types o extensiones) */
  allowedFileTypes: string[];
  /** Número máximo de usuarios permitidos en la organización */
  maxUsers: number;
  /** Límite de almacenamiento total de la organización en bytes */
  maxStorageTotal: number;
  /** Tamaño máximo de archivo individual en bytes */
  maxFileSize: number;
}

/**
 * Interface para el modelo de Organización
 * Representa un workspace o tenant en el sistema multi-tenant
 */
export interface IOrganization extends Document {
  _id: Types.ObjectId;
  /** Nombre de la organización */
  name: string;
  /** Slug único para URLs amigables (generado desde el nombre) */
  slug: string;
  /** Plan de suscripción de la organización */
  plan: SubscriptionPlan;
  /** Usuario propietario/administrador de la organización */
  owner: Types.ObjectId;
  /** Lista de usuarios miembros de la organización */
  members: Types.ObjectId[];
  /** Configuraciones específicas de la organización */
  settings: IOrganizationSettings;
  /** Indica si la organización está activa */
  active: boolean;
  /** Fecha de creación */
  createdAt: Date;
  /** Fecha de última actualización */
  updatedAt: Date;
  /** Virtual: Número de miembros */
  memberCount?: number;
  /** Método para agregar un miembro */
  addMember(userId: string | Types.ObjectId): void;
  /** Método para remover un miembro */
  removeMember(userId: string): void;
}

/**
 * DTO para crear una organización
 */
export interface CreateOrganizationDto {
  name: string;
  ownerId: string;
  plan?: SubscriptionPlan;
  settings?: Partial<IOrganizationSettings>;
}

/**
 * DTO para actualizar una organización
 */
export interface UpdateOrganizationDto {
  name?: string;
  settings?: Partial<IOrganizationSettings>;
  active?: boolean;
}
