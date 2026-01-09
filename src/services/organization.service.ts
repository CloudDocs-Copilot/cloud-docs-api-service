import Organization from '../models/organization.model';
import User from '../models/user.model';
import Folder from '../models/folder.model';
import Document from '../models/document.model';
import { IOrganization } from '../models/types/organization.types';
import HttpError from '../models/error.model';
import * as fs from 'fs';
import * as path from 'path';

/**
 * DTO para crear una organización
 */
export interface CreateOrganizationDto {
  name: string;
  ownerId: string;
  settings?: {
    maxStoragePerUser?: number;
    allowedFileTypes?: string[];
    maxUsers?: number;
  };
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
 * @param data - Datos de la organización a crear
 * @returns La organización creada
 */
export async function createOrganization(
  data: CreateOrganizationDto
): Promise<IOrganization> {
  const { name, ownerId, settings } = data;

  // Verificar que el usuario existe
  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new HttpError(404, 'Owner user not found');
  }

  // Crear la organización
  const organization = await Organization.create({
    name,
    owner: ownerId,
    settings: {
      maxStoragePerUser: settings?.maxStoragePerUser || 5368709120, // 5GB por defecto
      allowedFileTypes: settings?.allowedFileTypes || ['*'],
      maxUsers: settings?.maxUsers || 100,
    },
    members: [ownerId],
  });

  // Crear estructura de directorios en el filesystem
  const storageRoot = path.join(process.cwd(), 'storage');
  // Sanitizar slug para prevenir path traversal
  const safeSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const orgDir = path.join(storageRoot, safeSlug);
  try {
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }
  } catch (error) {
    // Si falla la creación del directorio, eliminar la organización de la BD
    await Organization.findByIdAndDelete(organization._id);
    throw new HttpError(500, 'Failed to create organization directory');
  }

  return organization;
}

/**
 * Agrega un usuario a una organización
 * @param organizationId - ID de la organización
 * @param userId - ID del usuario a agregar
 */
export async function addUserToOrganization(
  organizationId: string,
  userId: string
): Promise<void> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // Validar que el userId tenga el formato esperado de un ObjectId de MongoDB
  if (typeof userId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  // Verificar límite de usuarios
  if (
    organization.settings.maxUsers &&
    organization.members.length >= organization.settings.maxUsers
  ) {
    throw new HttpError(403, 'Organization has reached maximum number of users');
  }

  // Verificar si el usuario ya está en la organización
  if (organization.members.some((m) => m.toString() === userId)) {
    throw new HttpError(409, 'User is already a member of this organization');
  }

  // Agregar usuario a la organización
  organization.addMember(userId);
  await organization.save();

  // Actualizar organización del usuario
  user.organization = organization._id;
  await user.save();

  // Crear carpeta raíz para el usuario
  await createUserRootFolder(userId, organizationId);
}

/**
 * Remueve un usuario de una organización
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

  organization.removeMember(userId);
  await organization.save();

  // Actualizar usuario
  const user = await User.findById(userId);
  if (user) {
    user.organization = undefined;
    await user.save();
  }
}

/**
 * Obtiene las organizaciones de un usuario
 * @param userId - ID del usuario
 * @returns Lista de organizaciones del usuario
 */
export async function getUserOrganizations(
  userId: string
): Promise<IOrganization[]> {
  const organizations = await Organization.find({
    members: userId,
    active: true,
  }).populate('owner', 'name email');

  return organizations;
}

/**
 * Obtiene una organización por su ID
 * @param organizationId - ID de la organización
 * @returns La organización encontrada
 */
export async function getOrganizationById(
  organizationId: string
): Promise<IOrganization> {
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
    organization.name = data.name;
  }

  if (data.settings) {
    organization.settings = {
      ...organization.settings,
      ...data.settings,
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
export async function deleteOrganization(
  organizationId: string,
  userId: string
): Promise<void> {
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

  // Obtener usuarios de la organización
  const users = await User.find({
    _id: { $in: organization.members },
  }).select('name email storageUsed');

  // Contar documentos y folders de la organización
  const [totalDocuments, totalFolders] = await Promise.all([
    Document.countDocuments({ organization: organizationId }),
    Folder.countDocuments({ organization: organizationId }),
  ]);

  const totalStorageLimit =
    organization.settings.maxStoragePerUser * organization.members.length;
  const usedStorage = users.reduce((acc, user) => acc + user.storageUsed, 0);
  const availableStorage = totalStorageLimit - usedStorage;

  const storagePerUser = users.map((user) => ({
    userId: user._id.toString(),
    userName: user.name,
    storageUsed: user.storageUsed,
    percentage: (user.storageUsed / organization.settings.maxStoragePerUser) * 100,
  }));

  return {
    totalUsers: users.length,
    totalStorageLimit,
    totalDocuments,
    totalFolders,
    usedStorage,
    availableStorage,
    storagePerUser,
  };
}

/**
 * Crea la carpeta raíz para un usuario en una organización
 * @param userId - ID del usuario
 * @param organizationId - ID de la organización
 * @returns La carpeta raíz creada
 */
async function createUserRootFolder(
  userId: string,
  organizationId: string
): Promise<typeof Folder.prototype> {
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  // Verificar si ya existe una carpeta raíz para este usuario
  const existingRoot = await Folder.findOne({
    owner: userId,
    organization: organizationId,
    isRoot: true,
  });

  if (existingRoot) {
    return existingRoot;
  }

  // Sanitizar slug para prevenir path traversal
  const safeSlugForPath = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  
  // Crear carpeta raíz
  const rootFolder = await Folder.create({
    name: `root_user_${userId}`,
    type: 'root',
    owner: userId,
    organization: organizationId,
    parent: null,
    isRoot: true,
    path: `/${safeSlugForPath}/${userId}`,
    documents: [],
    sharedWith: [],
    permissions: [],
  });

  // Crear directorio físico
  const storageRoot = path.join(process.cwd(), 'storage');
  // Sanitizar slug y userId para prevenir path traversal
  const safeSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const safeUserId = userId.toString().replace(/[^a-z0-9]/gi, '');
  const folderPath = path.join(
    storageRoot,
    safeSlug,
    safeUserId
  );

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  } catch (error) {
    // Si falla, eliminar la carpeta de la BD
    await Folder.findByIdAndDelete(rootFolder._id);
    throw new HttpError(500, 'Failed to create user root folder directory');
  }

  // Actualizar referencia en el usuario
  await User.findByIdAndUpdate(userId, {
    rootFolder: rootFolder._id,
  });

  return rootFolder;
}
