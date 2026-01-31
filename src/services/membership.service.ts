import Membership, { IMembership, MembershipRole, MembershipStatus } from '../models/membership.model';
import Organization from '../models/organization.model';
import User from '../models/user.model';
import Folder from '../models/folder.model';
import HttpError from '../models/error.model';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Crea una membresía para un usuario en una organización
 * Crea automáticamente el rootFolder específico para esta organización
 */
export async function createMembership({
  userId,
  organizationId,
  role = MembershipRole.MEMBER,
  invitedBy,
}: {
  userId: string;
  organizationId: string;
  role?: MembershipRole;
  invitedBy?: string;
}): Promise<IMembership> {
  // Validate userId to prevent NoSQL injection via query operators and path traversal
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId format');
  }

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  if (!organization.active) {
    throw new HttpError(403, 'Organization is not active');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  // Verificar si ya existe membresía
  const existingMembership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
  });

  if (existingMembership) {
    throw new HttpError(409, 'User is already a member of this organization');
  }

  // Verificar límite de usuarios del plan
  const activeMembersCount = await Membership.countDocuments({
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE,
  });

  if (
    organization.settings.maxUsers !== -1 &&
    activeMembersCount >= organization.settings.maxUsers
  ) {
    throw new HttpError(
      403,
      `Organization has reached maximum users limit (${organization.settings.maxUsers}) for ${organization.plan} plan`
    );
  }

  let rootFolder = null;
  let userStoragePath = '';

  try {
    // Crear rootFolder específico para esta membresía (organización)

    const rootFolderName = `root_user_${userId}`;
    const safeOrgSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    const safeUserId = userId; // userId ya validado como ObjectId (24 hex)
    const rootFolderPath = `/${safeOrgSlug}/${safeUserId}`;

    // Construir y normalizar ruta física en storage/{org-slug}/{userId}
    const storageRoot = path.resolve(process.cwd(), 'storage');
    userStoragePath = path.resolve(storageRoot, safeOrgSlug, safeUserId);

    // Validar que la ruta generada esté contenida dentro de storageRoot
    const normalizedStorageRoot = storageRoot.endsWith(path.sep)
      ? storageRoot
      : storageRoot + path.sep;
    if (!userStoragePath.startsWith(normalizedStorageRoot)) {
      throw new HttpError(400, 'Invalid storage path resolved for user directory');
    }

    if (!fs.existsSync(userStoragePath)) {
      fs.mkdirSync(userStoragePath, { recursive: true });
    }

    // Crear carpeta raíz en la base de datos
    rootFolder = await Folder.create({
      name: rootFolderName,
      displayName: 'RootFolder',
      type: 'root',
      isRoot: true,
      organization: organizationId,
      owner: userId,
      parent: null,
      path: rootFolderPath,
      permissions: [{
        userId: userId,
        role: 'owner'
      }]
    });

    // Crear membresía con referencia al rootFolder
    const membership = await Membership.create({
      user: userId,
      organization: organizationId,
      role,
      status: MembershipStatus.ACTIVE,
      rootFolder: rootFolder._id,
      invitedBy: invitedBy || undefined,
    });

    // Actualizar array legacy en Organization
    if (!organization.members.includes(userId as any)) {
      organization.members.push(userId as any);
      await organization.save();
    }

    // Si es la primera organización del usuario, establecerla como activa
    if (!user.organization) {
      user.organization = organizationId as any;
      user.rootFolder = rootFolder._id as any;
      await user.save();
    } else if (user.organization.toString() === organizationId) {
      // Si es su organización actual, actualizar el rootFolder
      user.rootFolder = rootFolder._id as any;
      await user.save();
    }

    return membership;
  } catch (error) {
    // Rollback: limpiar rootFolder creado
    if (rootFolder?._id) {
      await Folder.findByIdAndDelete(rootFolder._id).catch(err =>
        console.error('Error deleting folder during rollback:', err)
      );
    }

    if (userStoragePath) {
      // Validar de nuevo antes de borrar
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const normalizedStorageRoot = storageRoot.endsWith(path.sep)
        ? storageRoot
        : storageRoot + path.sep;
      const resolvedUserStoragePath = path.resolve(userStoragePath);
      if (resolvedUserStoragePath.startsWith(normalizedStorageRoot) && fs.existsSync(resolvedUserStoragePath)) {
        try {
          fs.rmSync(resolvedUserStoragePath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Error deleting storage directory during rollback:', cleanupError);
        }
      }
    }

    throw error;
  }
}

/**
 * Verifica si un usuario tiene membresía activa en una organización
 */
export async function hasActiveMembership(
  userId: string,
  organizationId: string
): Promise<boolean> {
  // Validar userId para evitar inyección
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    return false;
  }
  const membership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE,
  });
  return !!membership;
}

/**
 * Obtiene la membresía de un usuario en una organización
 */
export async function getMembership(
  userId: string,
  organizationId: string
): Promise<IMembership | null> {
  // Validar userId para evitar inyección
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    return null;
  }
  return Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE,
  });
}

/**
 * Obtiene todas las membresías activas de un usuario con organizaciones activas
 */
export async function getUserMemberships(userId: string): Promise<IMembership[]> {
  // Validar userId para evitar inyección
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    return [];
  }
  return Membership.find({
    user: { $eq: userId },
    status: MembershipStatus.ACTIVE,
  }).populate({
    path: 'organization',
    select: 'name slug plan settings active',
    match: { active: true }
  }).then(memberships => 
    // Filtrar membresías donde la organización no fue filtrada (organization null)
    memberships.filter(membership => membership.organization !== null)
  );
}

/**
 * Obtiene la organización activa del usuario
 * Si no tiene, retorna la primera membresía activa
 */
export async function getActiveOrganization(userId: string): Promise<string | null> {
  const user = await User.findById(userId);
  if (!user) return null;

  // Si tiene organización seleccionada, verificar que tenga membresía activa
  if (user.organization) {
    const hasAccess = await hasActiveMembership(userId, user.organization.toString());
    if (hasAccess) {
      return user.organization.toString();
    }
  }

  // Si no tiene o no es válida, buscar la primera membresía activa
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    return null;
  }
  const membership = await Membership.findOne({
    user: { $eq: userId },
    status: MembershipStatus.ACTIVE,
  });

  if (membership) {
    // Actualizar organización activa del usuario
    user.organization = membership.organization;
    await user.save();
    return membership.organization.toString();
  }

  return null;
}

/**
 * Cambia la organización activa del usuario
 */
export async function switchActiveOrganization(
  userId: string,
  organizationId: string
): Promise<void> {
  // Verificar que tenga membresía en esa organización
  const hasAccess = await hasActiveMembership(userId, organizationId);
  if (!hasAccess) {
    throw new HttpError(403, 'You are not a member of this organization');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  user.organization = organizationId as any;
  await user.save();
}

/**
 * Obtiene miembros de una organización con sus roles
 */
export async function getOrganizationMembers(organizationId: string): Promise<IMembership[]> {
  const memberships = await Membership.find({
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE,
  })
    .populate('user', 'name email avatar')
    .populate('invitedBy', 'name email');

 
  return memberships;
}

/**
 * Actualiza el rol de un miembro en una organización
 */
export async function updateMemberRole(
  userId: string,
  organizationId: string,
  newRole: MembershipRole
): Promise<IMembership> {
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId');
  }
  const membership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
  });

  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }

  // No se puede cambiar el rol del owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot change owner role. Transfer ownership first.');
  }

  membership.role = newRole;
  await membership.save();

  return membership;
}

/**
 * Actualiza el rol de una membresía específica (por ID de membresía)
 * Requiere permisos de OWNER para ejecutar
 */
export async function updateMembershipRole(
  membershipId: string,
  newRole: MembershipRole,
  requestingUserId: string
): Promise<IMembership> {
  const membership = await Membership.findById(membershipId);
  
  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }

  // Verificar que el usuario solicitante sea OWNER de la organización
  const requesterMembership = await getMembership(
    requestingUserId,
    membership.organization.toString()
  );

  if (!requesterMembership || requesterMembership.role !== MembershipRole.OWNER) {
    throw new HttpError(403, 'Only organization owner can update member roles');
  }

  // No se puede cambiar el rol del owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot change owner role. Transfer ownership first.');
  }

  membership.role = newRole;
  await membership.save();

  return membership.populate('user', 'name email');
}

/**
 * Elimina una membresía específica (por ID de membresía)
 * Requiere permisos de ADMIN u OWNER para ejecutar
 */
export async function removeMembershipById(
  membershipId: string,
  organizationId: string,
  requestingUserId: string
): Promise<void> {
  const membership = await Membership.findById(membershipId);
  
  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }

  if (membership.organization.toString() !== organizationId) {
    throw new HttpError(400, 'Membership does not belong to this organization');
  }

  // Verificar que el usuario solicitante tenga permisos (ADMIN u OWNER)
  const requesterMembership = await getMembership(requestingUserId, organizationId);
  
  if (!requesterMembership || 
      (requesterMembership.role !== MembershipRole.OWNER && 
       requesterMembership.role !== MembershipRole.ADMIN)) {
    throw new HttpError(403, 'Only organization owner or admin can remove members');
  }

  // No se puede eliminar al owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot remove organization owner. Transfer ownership first.');
  }

  const userId = membership.user.toString();
  const rootFolderId = membership.rootFolder;

  // Suspender membresía
  membership.status = MembershipStatus.SUSPENDED;
  await membership.save();

  // Actualizar array legacy en organization
  const organization = await Organization.findById(organizationId);
  if (organization) {
    organization.members = organization.members.filter(
      (memberId: any) => memberId.toString() !== userId
    );
    await organization.save();
  }

  // Si era la organización activa del usuario, limpiarla
  const user = await User.findById(userId);
  if (user && user.organization?.toString() === organizationId) {
    user.organization = undefined;
    await user.save();
  }

  // Eliminar rootFolder y archivos físicos
  if (rootFolderId) {
    const rootFolder = await Folder.findById(rootFolderId);
    if (rootFolder) {
      const storageRoot = path.join(process.cwd(), 'storage');
      const folderPath = path.join(storageRoot, rootFolder.path);
      
      if (fs.existsSync(folderPath)) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch (error) {
          console.error('Error deleting folder during membership removal:', error);
        }
      }

      await Folder.findByIdAndDelete(rootFolderId);
    }
  }
}

/**
 * Elimina una membresía (soft delete)
 * Limpia el rootFolder asociado y actualiza referencias
 */
export async function removeMembership(userId: string, organizationId: string): Promise<void> {
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId');
  }
  const membership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
  });

  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }

  // Verificar que no sea el owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot remove organization owner. Transfer ownership first.');
  }

  // Obtener rootFolder antes de suspender
  const rootFolderId = membership.rootFolder;

  membership.status = MembershipStatus.SUSPENDED;
  await membership.save();

  // Actualizar array legacy en organization
  const organization = await Organization.findById(organizationId);
  if (organization) {
    organization.members = organization.members.filter(
      (memberId: any) => memberId.toString() !== userId
    );
    await organization.save();
  }

  // Si era la organización activa, limpiarla
  const user = await User.findById(userId);
  if (user && user.organization?.toString() === organizationId) {
    user.organization = undefined;
    await user.save();
  }

  // Opcional: Eliminar rootFolder y archivos físicos
  // (Podrías querer mantenerlos por un tiempo antes de eliminar permanentemente)
  if (rootFolderId) {
    const rootFolder = await Folder.findById(rootFolderId);
    if (rootFolder) {
      // Eliminar directorio físico
      const storageRoot = path.join(process.cwd(), 'storage');
      const folderPath = path.join(storageRoot, rootFolder.path);
      
      if (fs.existsSync(folderPath)) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch (error) {
          console.error('Error deleting folder during membership removal:', error);
        }
      }

      // Eliminar carpeta de BD (esto eliminará en cascada las subcarpetas si tienes middleware)
      await Folder.findByIdAndDelete(rootFolderId);
    }
  }
}

/**
 * Transfiere la propiedad de una organización a otro miembro
 */
export async function transferOwnership(
  currentOwnerId: string,
  newOwnerId: string,
  organizationId: string
): Promise<void> {
  // Verificar que el nuevo owner sea miembro activo
  const newOwnerMembership = await getMembership(newOwnerId, organizationId);
  if (!newOwnerMembership) {
    throw new HttpError(404, 'New owner is not a member of this organization');
  }

  // Actualizar organización
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new HttpError(404, 'Organization not found');
  }

  if (organization.owner.toString() !== currentOwnerId) {
    throw new HttpError(403, 'Only the current owner can transfer ownership');
  }

  organization.owner = newOwnerId as any;
  await organization.save();

  // Actualizar membresías
  const currentOwnerMembership = await getMembership(currentOwnerId, organizationId);
  if (currentOwnerMembership) {
    currentOwnerMembership.role = MembershipRole.ADMIN;
    await currentOwnerMembership.save();
  }

  newOwnerMembership.role = MembershipRole.OWNER;
  await newOwnerMembership.save();
}

export default {
  createMembership,
  hasActiveMembership,
  getMembership,
  getUserMemberships,
  getActiveOrganization,
  switchActiveOrganization,
  getOrganizationMembers,
  updateMemberRole,
  updateMembershipRole,
  removeMembership,
  removeMembershipById,
  transferOwnership,
};
