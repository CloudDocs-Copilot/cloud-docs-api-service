import Membership, {
  IMembership,
  MembershipRole,
  MembershipStatus
} from '../models/membership.model';
import Organization from '../models/organization.model';
import User from '../models/user.model';
import Folder from '../models/folder.model';
import DocumentModel from '../models/document.model';
import HttpError from '../models/error.model';
// email sending is required dynamically to make it easier to mock in tests
import * as fs from 'fs';
import * as path from 'path';

/**
 * Crea una invitación para un usuario a una organización
 * Status: PENDING (sin crear rootFolder aún)
 * Envía email de notificación
 */
export async function createInvitation({
  userId,
  organizationId,
  role = MembershipRole.MEMBER,
  invitedBy
}: {
  userId: string;
  organizationId: string;
  role?: MembershipRole;
  invitedBy: string;
}): Promise<IMembership> {
  // Validate userId to prevent NoSQL injection via query operators and path traversal
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId format');
  }

  if (typeof invitedBy !== 'string' || !/^[a-fA-F0-9]{24}$/.test(invitedBy)) {
    throw new HttpError(400, 'Invalid invitedBy format');
  }

  const organization = await Organization.findById(organizationId).populate('owner', 'name email');
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

  const inviter = await User.findById(invitedBy);
  if (!inviter) {
    throw new HttpError(404, 'Inviter user not found');
  }

  // Verificar si ya existe membresía (activa o pendiente)
  const existingMembership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId }
  });

  if (existingMembership) {
    if (existingMembership.status === MembershipStatus.ACTIVE) {
      throw new HttpError(409, 'User is already a member of this organization');
    }
    if (existingMembership.status === MembershipStatus.PENDING) {
      throw new HttpError(409, 'User already has a pending invitation to this organization');
    }
  }

  // Verificar límite de usuarios del plan (contar solo ACTIVE + PENDING)
  const totalMembersCount = await Membership.countDocuments({
    organization: { $eq: organizationId },
    status: { $in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING] }
  });

  if (
    organization.settings.maxUsers !== -1 &&
    totalMembersCount >= organization.settings.maxUsers
  ) {
    throw new HttpError(
      403,
      `Organization has reached maximum users limit (${organization.settings.maxUsers}) for ${organization.plan} plan`
    );
  }

  // Validar que el rol asignado esté permitido según el plan
  // Por ejemplo, el plan FREE podría no permitir múltiples ADMIN
  if (role === MembershipRole.ADMIN || role === MembershipRole.OWNER) {
    const adminCount = await Membership.countDocuments({
      organization: { $eq: organizationId },
      role: { $in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      status: MembershipStatus.ACTIVE
    });

    // Ejemplo: plan FREE solo permite 1 admin (el owner)
    if (organization.plan === 'free' && adminCount >= 1) {
      throw new HttpError(
        403,
        'Free plan does not allow multiple administrators. Upgrade to invite admins.'
      );
    }
  }

  // Crear membresía con estado PENDING (sin rootFolder)
  const membership = await Membership.create({
    user: userId,
    organization: organizationId,
    role,
    status: MembershipStatus.PENDING,
    invitedBy
    // rootFolder se creará al aceptar
  });

  // Notificación persistida + realtime al invitado
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const notificationService = require('./notification.service');

    const roleLower = String(role || '').toLowerCase();
    const roleDisplay =
      roleLower === 'admin' ? 'Admin' : roleLower === 'viewer' ? 'Viewer' : 'Member';

    await notificationService.createNotificationForUser({
      organizationId: organizationId,
      recipientUserId: userId,
      actorUserId: invitedBy,
      type: 'INVITATION_CREATED',
      entityKind: 'membership',
      entityId: membership._id.toString(),
      message: `${inviter.name || inviter.email} te invitó a ${organization.name} como ${roleDisplay}`,
      metadata: {
        role,
        organizationName: organization.name,
        inviterName: inviter.name || inviter.email
      }
    });
  } catch (e: any) {
    console.error('Failed to create notification (INVITATION_CREATED):', e.message);
  }

  // Enviar email de invitación
  try {
    const invitationTemplate = fs.readFileSync(
      path.join(process.cwd(), 'src', 'mail', 'invitationTemplate.html'),
      'utf-8'
    );

    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    const acceptUrl = `${appUrl}/api/memberships/invitations/${membership._id}/accept`;

    // Map internal role enum to a safe, human-readable label for the email template
    let roleDisplay: string;
    switch (role) {
      case MembershipRole.VIEWER:
        roleDisplay = 'Viewer';
        break;
      case MembershipRole.ADMIN:
        roleDisplay = 'Admin';
        break;
      case MembershipRole.MEMBER:
      default:
        roleDisplay = 'Member';
        break;
    }

    const emailHtml = invitationTemplate
      .replace(/{{userName}}/g, user.name || user.email)
      .replace(/{{organizationName}}/g, organization.name)
      .replace(/{{role}}/g, roleDisplay)
      .replace(/{{inviterName}}/g, inviter.name || inviter.email)
      .replace(/{{inviterEmail}}/g, inviter.email)
      .replace(/{{acceptUrl}}/g, acceptUrl)
      .replace(/{{appUrl}}/g, appUrl);

    // require mailer at runtime so unit tests can mock the module easily
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mail = require('../mail/emailService');
    await mail.sendConfirmationEmail(
      user.email,
      `Invitación a ${organization.name} en CloudDocs`,
      emailHtml
    );
  } catch (emailError) {
    console.error('Error sending invitation email:', emailError);
    // No bloqueamos la creación de la invitación si falla el email
  }

  return membership.populate('organization', 'name slug plan');
}

/**
 * Acepta una invitación pendiente
 * Crea el rootFolder y activa la membresía
 */
export async function acceptInvitation(membershipId: string, userId: string): Promise<IMembership> {
  const membership = await Membership.findById(membershipId).populate('organization');

  if (!membership) {
    throw new HttpError(404, 'Invitation not found');
  }

  if (membership.user.toString() !== userId) {
    throw new HttpError(403, 'This invitation is not for you');
  }

  if (membership.status !== MembershipStatus.PENDING) {
    throw new HttpError(400, 'Invitation is not pending');
  }

  const organization = membership.organization as any;
  if (!organization.active) {
    throw new HttpError(403, 'Organization is not active');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  // Verificar límite de usuarios activos antes de aceptar
  const activeMembersCount = await Membership.countDocuments({
    organization: { $eq: organization._id },
    status: MembershipStatus.ACTIVE
  });

  if (
    organization.settings.maxUsers !== -1 &&
    activeMembersCount >= organization.settings.maxUsers
  ) {
    throw new HttpError(
      403,
      `Organization has reached maximum active users limit (${organization.settings.maxUsers})`
    );
  }

  let rootFolder = null;
  let userStoragePath = '';

  try {
    // Crear rootFolder específico para esta membresía
    const safeOrgSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    const safeUserId = userId;
    const rootFolderName = `root_${safeOrgSlug}_${safeUserId}`;
    const rootFolderPath = `/${safeOrgSlug}/${safeUserId}`;

    // Construir y normalizar ruta física
    const storageRoot = path.resolve(process.cwd(), 'storage');
    userStoragePath = path.resolve(storageRoot, safeOrgSlug, safeUserId);

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
      organization: organization._id,
      owner: userId,
      parent: null,
      path: rootFolderPath,
      permissions: [
        {
          userId: userId,
          role: 'owner'
        }
      ]
    });

    // Actualizar membresía a ACTIVE con rootFolder
    membership.status = MembershipStatus.ACTIVE;
    membership.rootFolder = rootFolder._id as any;
    membership.joinedAt = new Date();
    await membership.save();

    // Actualizar array legacy en Organization
    if (!organization.members.includes(userId as any)) {
      organization.members.push(userId as any);
      await organization.save();
    }

    // Si es la primera organización del usuario, establecerla como activa
    if (!user.organization) {
      user.organization = organization._id as any;
      user.rootFolder = rootFolder._id as any;
      await user.save();
    }

    // Notificar a TODOS los miembros activos de esa organización (excluye al actor)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const notificationService = require('./notification.service');

      await notificationService.notifyMembersOfOrganization({
        organizationId: organization._id.toString(),
        actorUserId: userId,
        type: 'MEMBER_JOINED',
        entityKind: 'membership',
        entityId: membership._id.toString(),
        message: `${user.name || user.email} se unió a la organización`,
        metadata: {
          memberUserId: userId,
          memberName: user.name || user.email,
          role: membership.role,
          organizationName: organization.name
        }
      });
    } catch (e: any) {
      console.error('Failed to create notification (MEMBER_JOINED):', e.message);
    }

    return membership.populate('organization', 'name slug plan');
  } catch (error) {
    // Rollback: limpiar rootFolder creado
    if (rootFolder?._id) {
      await Folder.findByIdAndDelete(rootFolder._id).catch(err =>
        console.error('Error deleting folder during rollback:', err)
      );
    }

    if (userStoragePath) {
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const normalizedStorageRoot = storageRoot.endsWith(path.sep)
        ? storageRoot
        : storageRoot + path.sep;
      const resolvedUserStoragePath = path.resolve(userStoragePath);
      if (
        resolvedUserStoragePath.startsWith(normalizedStorageRoot) &&
        fs.existsSync(resolvedUserStoragePath)
      ) {
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
 * Rechaza una invitación pendiente
 */
export async function rejectInvitation(membershipId: string, userId: string): Promise<void> {
  const membership = await Membership.findById(membershipId);

  if (!membership) {
    throw new HttpError(404, 'Invitation not found');
  }

  if (membership.user.toString() !== userId) {
    throw new HttpError(403, 'This invitation is not for you');
  }

  if (membership.status !== MembershipStatus.PENDING) {
    throw new HttpError(400, 'Invitation is not pending');
  }

  // Eliminar invitación
  await Membership.findByIdAndDelete(membershipId);
}

/**
 * Obtiene las invitaciones pendientes de un usuario
 */
export async function getPendingInvitations(userId: string): Promise<IMembership[]> {
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId format');
  }

  return Membership.find({
    user: { $eq: userId },
    status: MembershipStatus.PENDING
  })
    .populate('organization', 'name slug plan')
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });
}

/**
 * Crea una membresía directamente en estado ACTIVE (uso interno/legacy)
 * Para invitaciones usar createInvitation + acceptInvitation
 */
export async function createMembership({
  userId,
  organizationId,
  role = MembershipRole.MEMBER,
  invitedBy
}: {
  userId: string;
  organizationId: string;
  role?: MembershipRole;
  invitedBy?: string;
}): Promise<IMembership> {
  // Validación básica
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
    organization: { $eq: organizationId }
  });

  if (existingMembership) {
    throw new HttpError(409, 'User is already a member of this organization');
  }

  // Verificar límite de usuarios del plan
  const activeMembersCount = await Membership.countDocuments({
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE
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
    const safeOrgSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    const safeUserId = userId;
    const rootFolderName = `root_${safeOrgSlug}_${safeUserId}`;
    const rootFolderPath = `/${safeOrgSlug}/${safeUserId}`;

    const storageRoot = path.resolve(process.cwd(), 'storage');
    userStoragePath = path.resolve(storageRoot, safeOrgSlug, safeUserId);

    const normalizedStorageRoot = storageRoot.endsWith(path.sep)
      ? storageRoot
      : storageRoot + path.sep;
    if (!userStoragePath.startsWith(normalizedStorageRoot)) {
      throw new HttpError(400, 'Invalid storage path resolved for user directory');
    }

    if (!fs.existsSync(userStoragePath)) {
      fs.mkdirSync(userStoragePath, { recursive: true });
    }

    rootFolder = await Folder.create({
      name: rootFolderName,
      displayName: 'RootFolder',
      type: 'root',
      isRoot: true,
      organization: organizationId,
      owner: userId,
      parent: null,
      path: rootFolderPath,
      permissions: [
        {
          userId: userId,
          role: 'owner'
        }
      ]
    });

    const membership = await Membership.create({
      user: userId,
      organization: organizationId,
      role,
      status: MembershipStatus.ACTIVE,
      rootFolder: rootFolder._id,
      invitedBy: invitedBy || undefined
    });

    if (!organization.members.includes(userId as any)) {
      organization.members.push(userId as any);
      await organization.save();
    }

    if (!user.organization) {
      user.organization = organizationId as any;
      user.rootFolder = rootFolder._id as any;
      await user.save();
    } else if (user.organization.toString() === organizationId) {
      user.rootFolder = rootFolder._id as any;
      await user.save();
    }

    return membership;
  } catch (error) {
    if (rootFolder?._id) {
      await Folder.findByIdAndDelete(rootFolder._id).catch(err =>
        console.error('Error deleting folder during rollback:', err)
      );
    }

    if (userStoragePath) {
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const normalizedStorageRoot = storageRoot.endsWith(path.sep)
        ? storageRoot
        : storageRoot + path.sep;
      const resolvedUserStoragePath = path.resolve(userStoragePath);
      if (
        resolvedUserStoragePath.startsWith(normalizedStorageRoot) &&
        fs.existsSync(resolvedUserStoragePath)
      ) {
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
    status: MembershipStatus.ACTIVE
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
    status: MembershipStatus.ACTIVE
  });
}

/**
 * NUEVO: Obtiene el rol de membresía ACTIVA del usuario en la organización.
 * Retorna null si no hay membresía activa.
 */
export async function getMembershipRole(
  userId: string,
  organizationId: string
): Promise<MembershipRole | null> {
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    return null;
  }

  const membership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId },
    status: MembershipStatus.ACTIVE
  }).select('role');

  return membership?.role ?? null;
}

/**
 * NUEVO: Verifica si el usuario tiene uno de los roles permitidos (en membresía ACTIVA).
 */
export async function hasAnyRole(
  userId: string,
  organizationId: string,
  allowedRoles: MembershipRole[]
): Promise<boolean> {
  const role = await getMembershipRole(userId, organizationId);
  if (!role) return false;
  return allowedRoles.includes(role);
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
    status: MembershipStatus.ACTIVE
  })
    .populate({
      path: 'organization',
      select: 'name slug plan settings active',
      match: { active: true }
    })
    .then(memberships =>
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
    status: MembershipStatus.ACTIVE
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
    status: MembershipStatus.ACTIVE
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
    organization: { $eq: organizationId }
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

  const oldRole = membership.role;
  membership.role = newRole;
  await membership.save();

  // Notificación al usuario afectado
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const notificationService = require('./notification.service');

    const requester = await User.findById(requestingUserId).select('name email').lean();
    const requesterName = (requester as any)?.name || (requester as any)?.email || 'Alguien';

    await notificationService.createNotificationForUser({
      organizationId: membership.organization.toString(),
      recipientUserId: membership.user.toString(),
      actorUserId: requestingUserId,
      type: 'MEMBER_ROLE_UPDATED',
      entityKind: 'membership',
      entityId: membership._id.toString(),
      message: `Tu rol fue actualizado de ${oldRole} a ${newRole} por ${requesterName}`,
      metadata: {
        oldRole,
        newRole,
        requesterName
      }
    });
  } catch (e: any) {
    console.error('Failed to create notification (MEMBER_ROLE_UPDATED):', e.message);
  }

  return membership.populate('user', 'name email');
}

/**
 * Función auxiliar para eliminar recursivamente subcarpetas y documentos
 */
async function deleteFolderContentsRecursively(folderId: string): Promise<void> {
  // Obtener todas las subcarpetas
  const subfolders = await Folder.find({ parent: folderId });

  for (const subfolder of subfolders) {
    // Recursión: eliminar contenido de subcarpetas
    await deleteFolderContentsRecursively(subfolder._id.toString());

    // Eliminar documentos de esta subcarpeta
    const docs = await DocumentModel.find({ folder: subfolder._id });
    for (const doc of docs) {
      try {
        // Eliminar archivo físico usando el path del documento
        if (doc.path && fs.existsSync(doc.path)) {
          fs.unlinkSync(doc.path);
        }
      } catch (e: any) {
        console.error('[delete-doc-error]', { id: doc._id, path: doc.path, err: e.message });
      }
      // Eliminar registro de documento
      await DocumentModel.findByIdAndDelete(doc._id);
    }

    // Eliminar registro de subcarpeta
    await Folder.findByIdAndDelete(subfolder._id);
  }

  // Eliminar documentos del folder actual
  const docs = await DocumentModel.find({ folder: folderId });
  for (const doc of docs) {
    try {
      if (doc.path && fs.existsSync(doc.path)) {
        fs.unlinkSync(doc.path);
      }
    } catch (e: any) {
      console.error('[delete-doc-error]', { id: doc._id, path: doc.path, err: e.message });
    }
    await DocumentModel.findByIdAndDelete(doc._id);
  }
}

/**
 * Elimina una membresía específica (por ID de membresía)
 * Requiere permisos de ADMIN u OWNER para ejecutar
 * ELIMINA PERMANENTEMENTE: membresía, carpetas, documentos y archivos físicos
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

  if (
    !requesterMembership ||
    (requesterMembership.role !== MembershipRole.OWNER &&
      requesterMembership.role !== MembershipRole.ADMIN)
  ) {
    throw new HttpError(403, 'Only organization owner or admin can remove members');
  }

  // No se puede eliminar al owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot remove organization owner. Transfer ownership first.');
  }

  const userId = membership.user.toString();
  const rootFolderId = membership.rootFolder;

  // 1. Eliminar rootFolder, subcarpetas y documentos
  if (rootFolderId) {
    const rootFolder = await Folder.findById(rootFolderId);
    if (rootFolder) {
      try {
        // Eliminar recursivamente subcarpetas y documentos de la BD
        await deleteFolderContentsRecursively(rootFolderId.toString());

        // Eliminar rootFolder de la BD
        await Folder.findByIdAndDelete(rootFolderId);

        // Eliminar directorio físico completo
        const storageRoot = path.resolve(process.cwd(), 'storage');
        const folderPath = path.resolve(storageRoot, rootFolder.path.replace(/^\//, ''));

        // Validación de seguridad: asegurar que está dentro de storage
        const normalizedStorageRoot = storageRoot.endsWith(path.sep)
          ? storageRoot
          : storageRoot + path.sep;

        if (folderPath.startsWith(normalizedStorageRoot) && fs.existsSync(folderPath)) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      } catch (error) {
        console.error('Error deleting folder contents during membership removal:', error);
        // Continuar con la eliminación aunque falle el borrado de archivos
      }
    }
  }

  // 2. Actualizar array legacy en organization
  const organization = await Organization.findById(organizationId);
  if (organization) {
    organization.members = organization.members.filter(
      (memberId: any) => memberId.toString() !== userId
    );
    await organization.save();
  }

  // 3. Si era la organización activa del usuario, limpiarla
  const user = await User.findById(userId);
  if (user && user.organization?.toString() === organizationId) {
    user.organization = undefined;
    user.rootFolder = undefined;
    await user.save();
  }

  // 4. Eliminar membresía permanentemente
  await Membership.findByIdAndDelete(membershipId);
}

/**
 * Elimina una membresía (cuando el usuario abandona la organización)
 * ELIMINA PERMANENTEMENTE: membresía, carpetas, documentos y archivos físicos
 */
export async function removeMembership(userId: string, organizationId: string): Promise<void> {
  if (typeof userId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(userId)) {
    throw new HttpError(400, 'Invalid userId');
  }
  const membership = await Membership.findOne({
    user: { $eq: userId },
    organization: { $eq: organizationId }
  });

  if (!membership) {
    throw new HttpError(404, 'Membership not found');
  }

  // Verificar que no sea el owner
  if (membership.role === MembershipRole.OWNER) {
    throw new HttpError(400, 'Cannot remove organization owner. Transfer ownership first.');
  }

  const rootFolderId = membership.rootFolder;

  // 1. Eliminar rootFolder, subcarpetas y documentos
  if (rootFolderId) {
    const rootFolder = await Folder.findById(rootFolderId);
    if (rootFolder) {
      try {
        // Eliminar recursivamente subcarpetas y documentos de la BD
        await deleteFolderContentsRecursively(rootFolderId.toString());

        // Eliminar rootFolder de la BD
        await Folder.findByIdAndDelete(rootFolderId);

        // Eliminar directorio físico completo
        const storageRoot = path.resolve(process.cwd(), 'storage');
        const folderPath = path.resolve(storageRoot, rootFolder.path.replace(/^\//, ''));

        // Validación de seguridad: asegurar que está dentro de storage
        const normalizedStorageRoot = storageRoot.endsWith(path.sep)
          ? storageRoot
          : storageRoot + path.sep;

        if (folderPath.startsWith(normalizedStorageRoot) && fs.existsSync(folderPath)) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      } catch (error) {
        console.error('Error deleting folder contents during membership removal:', error);
        // Continuar con la eliminación aunque falle el borrado de archivos
      }
    }
  }

  // 2. Actualizar array legacy en organization
  const organization = await Organization.findById(organizationId);
  if (organization) {
    organization.members = organization.members.filter(
      (memberId: any) => memberId.toString() !== userId
    );
    await organization.save();
  }

  // 3. Si era la organización activa del usuario, limpiarla
  const user = await User.findById(userId);
  if (user && user.organization?.toString() === organizationId) {
    user.organization = undefined;
    user.rootFolder = undefined;
    await user.save();
  }

  // 4. Eliminar membresía permanentemente
  await Membership.findByIdAndDelete(membership._id);
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
  createInvitation,
  acceptInvitation,
  rejectInvitation,
  getPendingInvitations,
  hasActiveMembership,
  getMembership,
  getMembershipRole,
  hasAnyRole,
  getUserMemberships,
  getActiveOrganization,
  switchActiveOrganization,
  getOrganizationMembers,
  updateMemberRole,
  updateMembershipRole,
  removeMembership,
  removeMembershipById,
  transferOwnership
};
