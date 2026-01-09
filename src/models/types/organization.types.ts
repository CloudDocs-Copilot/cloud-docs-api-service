import { Document, Types } from 'mongoose';

/**
 * Interface para las configuraciones de una organización
 */
export interface IOrganizationSettings {
  /** Límite de almacenamiento por usuario en bytes */
  maxStoragePerUser: number;
  /** Tipos de archivo permitidos (MIME types o extensiones) */
  allowedFileTypes: string[];
  /** Número máximo de usuarios permitidos en la organización */
  maxUsers?: number;
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
  addMember(userId: string): void;
  /** Método para remover un miembro */
  removeMember(userId: string): void;
}

/**
 * DTO para crear una organización
 */
export interface CreateOrganizationDto {
  name: string;
  ownerId: string;
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
