import mongoose from 'mongoose';
import Organization from '../models/organization.model';
import User from '../models/user.model';
import Folder from '../models/folder.model';
import Document from '../models/document.model';
import { IMembership } from '../models/membership.model';
import {
  IOrganization,
  SubscriptionPlan,
  CreateOrganizationDto
} from '../models/types/organization.types';
import HttpError from '../models/error.model';
import { createMembership } from './membership.service';
import { MembershipRole } from '../models/membership.model';

// Helper: escape text for use in RegExp
function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * DTO para actualizar una organización
 */
export interface UpdateOrganizationDto {
  name?: string;
  settings?: {
    maxStoragePerUser?: number;
    allowedFileTypes?: string[];
    maxUsers?: number;
  };
  active?: boolean;
}

/**
 * Crea una nueva organización con su estructura de directorios
 * Usa Membership para crear la relación usuario-organización y el rootFolder
 * @param data - Datos de la organización a crear
 * @returns La organización creada
 */
export async function createOrganization(data: CreateOrganizationDto): Promise<IOrganization> {
  const { name, ownerId, plan = SubscriptionPlan.FREE } = data;

  // Verificar que el usuario existe
  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new HttpError(404, 'Owner user not found');
  }

  // Crear la organización (los settings se configuran automáticamente por el middleware pre-save)
  // Validar nombre único (case-insensitive)
  const normalizedName = name.trim();
  const existingByName = await Organization.findOne({
    name: { $regex: `^${escapeForRegex(normalizedName)}$`, $options: 'i' }
  });
  if (existingByName) {
    throw new HttpError(409, 'Organization name already exists');
  }

  const organization = await Organization.create({
    name,
    owner: ownerId,
    plan,
    members: [ownerId] // Array legacy
  });

  try {
    // Crear Membership como OWNER (esto crea automáticamente el rootFolder)
    await createMembership({
      userId: ownerId,
      organizationId: organization._id.toString(),
      role: MembershipRole.OWNER
    });

    return organization;
  } catch (error) {
    // Si falla, limpiar organización creada
    await Organization.findByIdAndDelete(organization._id);
    throw error;
  }
}

/**
 * Agrega un usuario a una organización
 * 🆕 Ahora usa Membership service
 * @param organizationId - ID de la organización
 * @param userId - ID del usuario a agregar
 * @param invitedBy - ID del usuario que invita (opcional)
 */
export async function addUserToOrganization(
  organizationId: string,
  userId: string,
  invitedBy?: string
): Promise<void> {
  // Validar que el userId tenga el formato esperado de un ObjectId de MongoDB
  if (typeof userId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  // 🆕 Usar createMembership que valida límites y crea rootFolder
  await createMembership({
    userId,
    organizationId,
    role: MembershipRole.MEMBER,
    invitedBy
  });
}

/**
 * Remueve un usuario de una organización
 * 🆕 Ahora usa removeMembership service
 * @param organizationId - ID de la organización
 * @param userId - ID del usuario a remover
 */
export async function removeUserFromOrganization(
  organizationId: string,
  userId: string
): Promise<void> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // No permitir remover al owner
  if (organization.owner.toString() === userId) {
    throw new HttpError(400, 'Cannot remove the owner from the organization');
  }

  // 🆕 Usar removeMembership que limpia todo
  const { removeMembership } = await import('./membership.service');
  await removeMembership(userId, organizationId);
}

/**
 * Obtiene las organizaciones de un usuario
 * 🆕 Ahora usa getUserMemberships para obtener todas las organizaciones
 * @param userId - ID del usuario
 * @returns Lista de organizaciones del usuario
 */
export async function getUserOrganizations(userId: string): Promise<IMembership[]> {
  // 🆕 Usar membership service y devolver las membresías completas
  const { getUserMemberships } = await import('./membership.service');
  const memberships = await getUserMemberships(userId);
  // Devolver las memberships con la organización poblada (consistencia con getOrganizationMembers)
  return memberships;
}

/**
 * Obtiene una organización por su ID
 * @param organizationId - ID de la organización
 * @returns La organización encontrada
 */
export async function getOrganizationById(organizationId: string): Promise<IOrganization> {
  const organization = await Organization.findById(organizationId)
    .populate('owner', 'name email')
    .populate('members', 'name email');

  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  return organization;
}

/**
 * Actualiza una organización
 * @param organizationId - ID de la organización
 * @param userId - ID del usuario que actualiza (debe ser owner)
 * @param data - Datos a actualizar
 * @returns La organización actualizada
 */
export async function updateOrganization(
  organizationId: string,
  userId: string,
  data: UpdateOrganizationDto
): Promise<IOrganization> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // Verificar que el usuario es el owner
  if (organization.owner.toString() !== userId) {
    throw new HttpError(403, 'Only organization owner can update organization');
  }

  // Actualizar campos
  if (data.name !== undefined) {
    const newName = data.name.trim();
    // Verificar que no exista otra organización con el mismo nombre (case-insensitive)
    const existing = await Organization.findOne({
      name: { $regex: `^${escapeForRegex(newName)}$`, $options: 'i' },
      _id: { $ne: organization._id }
    });
    if (existing) {
      throw new HttpError(409, 'Organization name already exists');
    }

    organization.name = newName;
  }

  if (data.settings) {
    organization.settings = {
      ...organization.settings,
      ...data.settings
    };
  }

  if (data.active !== undefined) {
    organization.active = data.active;
  }

  await organization.save();
  return organization;
}

/**
 * Elimina una organización (soft delete)
 * @param organizationId - ID de la organización
 * @param userId - ID del usuario que elimina (debe ser owner)
 */
export async function deleteOrganization(organizationId: string, userId: string): Promise<void> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // Verificar que el usuario es el owner
  if (organization.owner.toString() !== userId) {
    throw new HttpError(403, 'Only organization owner can delete organization');
  }

  // Soft delete
  organization.active = false;
  await organization.save();
}

/**
 * Obtiene estadísticas de almacenamiento de una organización
 * @param organizationId - ID de la organización
 * @returns Estadísticas de almacenamiento
 */
export async function getOrganizationStorageStats(organizationId: string): Promise<{
  totalUsers: number;
  totalStorageLimit: number;
  totalDocuments: number;
  totalFolders: number;
  usedStorage: number;
  availableStorage: number;
  storagePerUser: {
    userId: string;
    userName: string;
    storageUsed: number;
    percentage: number;
  }[];
}> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // Convertir members a ObjectIds para prevenir inyección NoSQL
  const memberObjectIds = organization.members.map(id => new mongoose.Types.ObjectId(id.toString()));

  // Obtener usuarios de la organización
  const users = await User.find({
    _id: { $in: memberObjectIds }
  }).select('name email storageUsed');

  // Contar documentos y folders de la organización
  const [totalDocuments, totalFolders] = await Promise.all([
    Document.countDocuments({ organization: organizationId }),
    Folder.countDocuments({ organization: organizationId })
  ]);

  const totalStorageLimit = organization.settings.maxStoragePerUser * organization.members.length;
  const usedStorage = users.reduce((acc, user) => acc + user.storageUsed, 0);
  const availableStorage = totalStorageLimit - usedStorage;

  const storagePerUser = users.map(user => ({
    userId: String(user._id),
    userName: user.name,
    storageUsed: user.storageUsed,
    percentage: (user.storageUsed / organization.settings.maxStoragePerUser) * 100
  }));

  return {
    totalUsers: users.length,
    totalStorageLimit,
    totalDocuments,
    totalFolders,
    usedStorage,
    availableStorage,
    storagePerUser
  };
}

/**
 * 🗑️ DEPRECATED: Esta función ya no se usa
 * El rootFolder ahora se crea automáticamente en createMembership
 * @deprecated Use createMembership from membership.service instead
 */
// async function createUserRootFolder(...) { ... }
