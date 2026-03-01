import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import os from 'os';
import DocumentModel, { IDocument } from '../models/document.model';
import Folder from '../models/folder.model';
import User from '../models/user.model';
import Organization from '../models/organization.model';
import HttpError from '../models/error.model';
import { sanitizePathOrThrow, isPathWithinBase } from '../utils/path-sanitizer';
import { validateFolderAccess } from './folder.service';
import { getMembership, getActiveOrganization, hasAnyRole } from './membership.service';
import { MembershipRole } from '../models/membership.model';
import { PLAN_LIMITS } from '../models/types/organization.types';
import * as searchService from './search.service';
import * as notificationService from './notification.service';
import { emitToUser } from '../socket/socket';
import { processDocumentAI } from '../jobs/process-document-ai.job';
import { textExtractionService } from './ai/text-extraction.service';
import { extractContentFromDocument } from '../utils/pdf-extractor';
import { getDocumentSelect } from '../utils/document-fields.util';
import { documentProcessor } from './document-processor.service';

/**
 * Valida si un string es un ObjectId válido de MongoDB
 *
 * @param id - String a validar
 * @returns true si es un ObjectId válido
 */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

interface NotificationActor {
  name?: string;
  email?: string;
}

interface UserIdOnly {
  _id: mongoose.Types.ObjectId;
}

export interface ShareDocumentDto {
  id: string;
  userId: string;
  userIds: string[];
}

export interface DeleteDocumentDto {
  id: string;
  userId: string;
}

export interface UploadDocumentDto {
  file: Express.Multer.File;
  userId: string;
  folderId?: string; // Opcional - usa rootFolder de la membresía activa si no se especifica
}

export interface ReplaceDocumentFileDto {
  documentId: string;
  userId: string;
  file: Express.Multer.File;
}

export interface MoveDocumentDto {
  documentId: string;
  userId: string;
  targetFolderId: string;
}

export interface CopyDocumentDto {
  documentId: string;
  userId: string;
  targetFolderId: string;
}

export interface GetRecentDocumentsDto {
  userId: string;
  limit?: number;
}

/**
 * Compartir un documento con una lista de usuarios
 */
export async function shareDocument({
  id,
  userId,
  userIds
}: ShareDocumentDto): Promise<IDocument | null> {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpError(400, 'userIds must be a non-empty array');
  }
  const uniqueIds = [...new Set(userIds.filter(isValidObjectId))];
  if (uniqueIds.length === 0) throw new HttpError(400, 'At least one valid user id is required');

  const doc = await DocumentModel.findById(id);
  if (!doc) throw new Error('Document not found');

  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Filtra el owner de la lista de usuarios con los que compartir
  const filteredIds = uniqueIds.filter(id => String(id) !== String(userId));
  if (filteredIds.length === 0) {
    throw new HttpError(400, 'Cannot share document with yourself as the owner');
  }

  // Org context: validate recipients are ACTIVE members in the same active org as actor
  if (doc.organization) {
    const activeOrgId = await getActiveOrganization(userId);
    if (!activeOrgId) {
      throw new HttpError(
        403,
        'No active organization. Please create or join an organization first.'
      );
    }

    if (doc.organization.toString() !== activeOrgId) {
      throw new HttpError(403, 'Document does not belong to your active organization');
    }

    const allowedRecipientIds: string[] = [];
    for (const recipientId of filteredIds) {
      const membership = await getMembership(recipientId, activeOrgId);
      if (membership) {
        allowedRecipientIds.push(recipientId);
      }
    }

    if (allowedRecipientIds.length === 0) {
      throw new HttpError(400, 'No valid users found to share with');
    }

    const allowedObjectIds = allowedRecipientIds.map(id => new mongoose.Types.ObjectId(id));

    const updated = await DocumentModel.findByIdAndUpdate(
      id,
      { $addToSet: { sharedWith: { $each: allowedObjectIds } } },
      { new: true }
    );

    // Notifications: only to selected recipients (persisted + realtime)
    try {
      const actor = await User.findById(userId).select('name email').lean<NotificationActor>();
      const actorName = actor?.name || actor?.email || 'Alguien';

      for (const recipientId of allowedRecipientIds) {
        await notificationService.createNotificationForUser({
          organizationId: activeOrgId,
          recipientUserId: recipientId,
          actorUserId: userId,
          type: 'DOC_SHARED',
          entityKind: 'document',
          entityId: doc._id.toString(),
          message: `${actorName} compartió "${doc.originalname || 'un documento'}" contigo`,
          metadata: {
            originalname: doc.originalname,
            folderId: doc.folder?.toString?.(),
            actorName
          },
          emitter: (recipientUserId, payload) => {
            emitToUser(recipientUserId, 'notification:new', payload);
          }
        });
      }
    } catch (error: unknown) {
      console.error('Failed to create notification (DOC_SHARED):', getErrorMessage(error));
    }

    return updated;
  }

  // Personal docs (legacy): only share to existing users
  const filteredObjectIds = filteredIds.map(id => new mongoose.Types.ObjectId(id));

  const existingUsers = await User.find({ _id: { $in: filteredObjectIds } }, { _id: 1 }).lean<
    UserIdOnly[]
  >();
  const existingIds = existingUsers.map(user => user._id);
  if (existingIds.length === 0) throw new HttpError(400, 'No valid users found to share with');

  const updated = await DocumentModel.findByIdAndUpdate(
    id,
    { $addToSet: { sharedWith: { $each: existingIds } } },
    { new: true }
  );

  return updated;
}

/**
 * Lista documentos compartidos al usuario (por otros usuarios) en su organización activa
 */
export async function listSharedDocumentsToUser(userId: string): Promise<IDocument[]> {
  if (!isValidObjectId(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }

  const activeOrgId = await getActiveOrganization(userId);
  if (!activeOrgId) {
    throw new HttpError(
      403,
      'No existe una organización activa. Por favor, crea o únete a una organización primero.'
    );
  }

  const orgObjectId = new mongoose.Types.ObjectId(activeOrgId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const docs = await DocumentModel.find({
    organization: orgObjectId,
    sharedWith: userObjectId,
    uploadedBy: { $ne: userObjectId },
    isDeleted: false
  })
    .sort({ createdAt: -1 })
    .populate('folder', 'name displayName path')
    .select(getDocumentSelect('list')) // 🤖 Incluye campos AI explícitamente
    .lean();

  return docs as unknown as IDocument[];
}

/**
 * Reemplazar (sobrescribir) el archivo físico y metadatos de un documento existente
 * Mantiene el mismo doc.path y doc.filename para que el URL quede estable.
 */
export async function replaceDocumentFile({
  documentId,
  userId,
  file
}: ReplaceDocumentFileDto): Promise<IDocument> {
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');
  if (!file || !file.filename) throw new HttpError(400, 'File is required');

  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new Error('Document not found');

  // Permisos:
  // - Si es de organización: permitir a OWNER/ADMIN, o al uploadedBy (propietario del documento).
  // - Si es personal: solo uploadedBy.
  if (doc.organization) {
    const orgId = doc.organization.toString();

    const isOrgAdmin = await hasAnyRole(userId, orgId, [
      MembershipRole.OWNER,
      MembershipRole.ADMIN
    ]);

    const isDocOwner = String(doc.uploadedBy) === String(userId);

    if (!isOrgAdmin && !isDocOwner) {
      throw new HttpError(403, 'No tienes permisos para editar este documento');
    }
  } else {
    if (String(doc.uploadedBy) !== String(userId)) {
      throw new HttpError(403, 'Forbidden');
    }
  }

  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const orgIdForLimits = doc.organization?.toString() || (await getActiveOrganization(userId));
  if (!orgIdForLimits) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  const organization = await Organization.findById(orgIdForLimits);
  if (!organization) throw new HttpError(404, 'Organization not found');

  const newFileSize = file.size || 0;

  // Validar tamaño máximo de archivo según el plan
  const planLimits = PLAN_LIMITS[organization.plan];
  if (newFileSize > planLimits.maxFileSize) {
    throw new HttpError(
      400,
      `File size exceeds maximum allowed (${planLimits.maxFileSize} bytes) for ${organization.plan} plan`
    );
  }

  // Validar tipo de archivo permitido según el plan
  // Fuente única de verdad: PLAN_LIMITS (no settings de BD, que puede estar desactualizado)
  const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
  const allowedTypes = PLAN_LIMITS[organization.plan].allowedFileTypes;

  if (!allowedTypes.includes('*') && !allowedTypes.includes(fileExt)) {
    throw new HttpError(
      400,
      `File type '${fileExt}' not allowed for ${organization.plan} plan. Allowed types: ${allowedTypes.join(', ')}`
    );
  }

  // Ajustar cuota de almacenamiento del usuario con delta
  const oldSize = doc.size || 0;
  const delta = newFileSize - oldSize;

  const maxStoragePerUser = organization.settings.maxStoragePerUser;
  const currentUsage = user.storageUsed || 0;

  if (delta > 0 && currentUsage + delta > maxStoragePerUser) {
    throw new HttpError(
      403,
      `Storage quota exceeded. Used: ${currentUsage}, Limit: ${maxStoragePerUser} (${organization.plan} plan)`
    );
  }

  // Path temp (uploads) del nuevo archivo subido
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const rawFilename = path.basename(file.filename);
  const sanitizedTempFilename = sanitizePathOrThrow(rawFilename, uploadsRoot);
  const tempPath = path.join(uploadsRoot, sanitizedTempFilename);

  // Path destino: el mismo archivo del documento (doc.path/doc.filename)
  const storageRoot = path.join(process.cwd(), 'storage');
  const relativeStoragePath = (doc.path || '').startsWith('/')
    ? (doc.path || '').substring(1)
    : doc.path || '';
  const physicalPath = path.join(storageRoot, relativeStoragePath);

  if (!relativeStoragePath) {
    throw new HttpError(400, 'Document storage path is missing');
  }

  // Validación defensa en profundidad
  if (!isPathWithinBase(physicalPath, storageRoot)) {
    throw new HttpError(400, 'Invalid destination path');
  }

  // Overwrite físico
  try {
    const destDir = path.dirname(physicalPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (!fs.existsSync(tempPath)) {
      throw new HttpError(500, 'Uploaded file not found in temp directory');
    }

    if (fs.existsSync(physicalPath)) {
      fs.unlinkSync(physicalPath);
    }

    fs.renameSync(tempPath, physicalPath);
  } catch (error: unknown) {
    console.error('File replace error:', getErrorMessage(error));
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanupError: unknown) {
      console.error('Temp file cleanup error:', getErrorMessage(cleanupError));
    }
    throw new HttpError(500, 'Failed to replace file in storage');
  }

  doc.originalname = file.originalname;
  doc.mimeType = file.mimetype || 'application/octet-stream';
  doc.size = newFileSize;
  await doc.save();

  user.storageUsed = Math.max(0, currentUsage + delta);
  await user.save();

  try {
    await searchService.indexDocument(doc);
  } catch (error: unknown) {
    console.error('Failed to index document in search:', getErrorMessage(error));
  }

  // Notificación (persistida) a miembros de la organización (excluye al actor)
  if (doc.organization) {
    try {
      await notificationService.notifyOrganizationMembers({
        actorUserId: userId,
        type: 'DOC_EDITED',
        documentId: doc._id.toString(),
        message: `${user.name || user.email} actualizó "${doc.originalname}"`,
        metadata: {
          originalname: doc.originalname,
          folderId: doc.folder?.toString?.()
        },
        emitter: (recipientUserId, payload) => {
          emitToUser(recipientUserId, 'notification:new', payload);
        }
      });
    } catch (error: unknown) {
      console.error('Failed to create notification (DOC_EDITED):', getErrorMessage(error));
    }
  }

  return doc;
}

/**
 * Eliminar un documento con permisos:
 * - Si es de organización: SOLO OWNER o ADMIN pueden eliminar.
 * - Si es personal (sin organización): SOLO el uploadedBy puede eliminar (legacy).
 */
export async function deleteDocument({ id, userId }: DeleteDocumentDto): Promise<IDocument | null> {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');

  const doc = await DocumentModel.findById(id);
  if (!doc) throw new Error('Document not found');

  // Permisos para documentos de organización
  if (doc.organization) {
    const orgId = doc.organization.toString();

    const canDelete = await hasAnyRole(userId, orgId, [MembershipRole.OWNER, MembershipRole.ADMIN]);

    if (!canDelete) {
      throw new HttpError(
        403,
        'Solo el propietario o administradores de la organización pueden eliminar este documento'
      );
    }
  } else {
    // Personal: solo el propietario (uploadedBy)
    if (String(doc.uploadedBy) !== String(userId)) {
      throw new HttpError(403, 'Forbidden');
    }
  }

  // Elimina el archivo físico
  try {
    if (doc.path) {
      const storageRoot = path.join(process.cwd(), 'storage');
      const relativePath = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;
      const filePath = path.join(storageRoot, relativePath);

      if (isPathWithinBase(filePath, storageRoot) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Fallback: buscar en uploads legacy
    if (doc.filename) {
      const uploadsBase = path.join(process.cwd(), 'uploads');
      const safeFilename = sanitizePathOrThrow(doc.filename, uploadsBase);
      const uploadsPath = path.join(uploadsBase, safeFilename);

      if (fs.existsSync(uploadsPath)) {
        fs.unlinkSync(uploadsPath);
      }
    }
  } catch (error: unknown) {
    console.error('File deletion error:', getErrorMessage(error));
  }

  // Actualizar almacenamiento usado del usuario
  const user = await User.findById(userId);
  if (user && doc.size) {
    user.storageUsed = Math.max(0, (user.storageUsed || 0) - doc.size);
    await user.save();
  }

  const deleted = await DocumentModel.findByIdAndDelete(id);

  // Eliminar documento del índice de Elasticsearch y chunks vectoriales
  if (deleted) {
    try {
      await searchService.removeDocumentFromIndex(id);
    } catch (error: unknown) {
      console.error('Failed to remove document from search index:', getErrorMessage(error));
      // No lanzar error para no bloquear la eliminación
    }

    // Eliminar chunks de MongoDB Atlas (vector search)
    try {
      await documentProcessor.deleteDocumentChunks(id);
    } catch (error: unknown) {
      console.error('Failed to delete document chunks:', getErrorMessage(error));
      // No lanzar error para no bloquear la eliminación
    }
  }

  // Notificación (persistida) a miembros de la organización (excluye al actor)
  if (doc.organization) {
    try {
      const actor = await User.findById(userId).select('name email').lean<NotificationActor>();
      const actorName = actor?.name || actor?.email || 'Alguien';

      await notificationService.notifyOrganizationMembers({
        actorUserId: userId,
        type: 'DOC_DELETED',
        documentId: doc._id.toString(),
        message: `${actorName} eliminó "${doc.originalname || 'un documento'}"`,
        metadata: {
          originalname: doc.originalname,
          folderId: doc.folder?.toString?.(),
          actorName
        },
        emitter: (recipientUserId, payload) => {
          emitToUser(recipientUserId, 'notification:new', payload);
        }
      });
    } catch (error: unknown) {
      console.error('Failed to create notification (DOC_DELETED):', getErrorMessage(error));
    }
  }

  return deleted;
}

/**
 * Mover un documento a otra carpeta
 */
export async function moveDocument({
  documentId,
  userId,
  targetFolderId
}: MoveDocumentDto): Promise<IDocument> {
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');
  if (!isValidObjectId(targetFolderId)) throw new HttpError(400, 'Invalid target folder ID');

  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new HttpError(404, 'Document not found');

  // Solo el propietario puede mover
  if (String(doc.uploadedBy) !== String(userId)) {
    throw new HttpError(403, 'Only document owner can move it');
  }

  // Validar acceso de editor a la carpeta destino
  await validateFolderAccess(targetFolderId, userId, 'editor');

  const targetFolder = await Folder.findById(targetFolderId);
  if (!targetFolder) throw new HttpError(404, 'Target folder not found');

  // Validar compatibilidad de organización
  const docOrgId = doc.organization?.toString();
  const folderOrgId = targetFolder.organization?.toString();

  if (docOrgId !== folderOrgId) {
    if (!docOrgId && !folderOrgId) {
      // Ambos son personales - OK
    } else if (docOrgId && folderOrgId) {
      throw new HttpError(400, 'Cannot move document to folder in different organization');
    } else {
      throw new HttpError(400, 'Cannot move document between personal and organization contexts');
    }
  }

  // Validar existencia de organización si aplica
  if (doc.organization) {
    const organization = await Organization.findById(doc.organization);
    if (!organization) throw new HttpError(404, 'Organization not found');
  }

  // Construir nuevo path
  const storageRoot = path.join(process.cwd(), 'storage');
  const safeFilename = sanitizePathOrThrow(doc.filename || '', storageRoot);
  const newDocPath = `${targetFolder.path}/${safeFilename}`;

  const oldRelativePath = (doc.path || '').startsWith('/')
    ? (doc.path || '').substring(1)
    : doc.path || '';
  const newRelativePath = newDocPath.startsWith('/') ? newDocPath.substring(1) : newDocPath;

  const oldPhysicalPath = path.join(storageRoot, oldRelativePath);
  const newPhysicalPath = path.join(storageRoot, newRelativePath);

  // Mover archivo físico
  try {
    if (
      !isPathWithinBase(oldPhysicalPath, storageRoot) ||
      !isPathWithinBase(newPhysicalPath, storageRoot)
    ) {
      throw new HttpError(400, 'Ubicación de archivo inválida');
    }

    if (fs.existsSync(oldPhysicalPath)) {
      // Asegurar que el directorio destino existe
      const newDir = path.dirname(newPhysicalPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      fs.renameSync(oldPhysicalPath, newPhysicalPath);
    }
  } catch (error: unknown) {
    console.error('File move error:', getErrorMessage(error));
    throw new HttpError(500, 'Failed to move file in storage');
  }

  // Actualizar documento en BD
  doc.folder = targetFolder._id;
  doc.path = newDocPath;
  doc.url = `/storage${newDocPath}`;
  await doc.save();

  return doc;
}

/**
 * Copiar un documento a otra carpeta
 */
export async function copyDocument({
  documentId,
  userId,
  targetFolderId
}: CopyDocumentDto): Promise<IDocument> {
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');
  if (!isValidObjectId(targetFolderId)) throw new HttpError(400, 'Invalid target folder ID');

  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new HttpError(404, 'Document not found');

  // Usuario debe tener acceso al documento original:
  // - Si es de organización: cualquier miembro activo
  // - Si es personal: owner o sharedWith.
  const hasAccess =
    String(doc.uploadedBy) === String(userId) ||
    doc.sharedWith?.some((id: mongoose.Types.ObjectId) => String(id) === String(userId));

  if (!hasAccess) {
    throw new HttpError(403, 'You do not have access to this document');
  }

  // Validar acceso de editor a la carpeta destino
  await validateFolderAccess(targetFolderId, userId, 'editor');

  const targetFolder = await Folder.findById(targetFolderId);
  if (!targetFolder) throw new HttpError(404, 'Target folder not found');

  // Validar compatibilidad de organización
  const docOrgId = doc.organization?.toString();
  const folderOrgId = targetFolder.organization?.toString();

  if (docOrgId !== folderOrgId) {
    if (!docOrgId && !folderOrgId) {
      // Ambos son personales - OK
    } else if (docOrgId && folderOrgId) {
      throw new HttpError(400, 'Cannot copy document to folder in different organization');
    } else {
      throw new HttpError(400, 'Cannot copy document between personal and organization contexts');
    }
  }

  // Obtener organización si existe
  let org = null;
  if (doc.organization) {
    org = await Organization.findById(doc.organization);
    if (!org) throw new HttpError(404, 'Organization not found');
  }

  // Validar cuota de almacenamiento del usuario
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const maxStorage = org ? org.settings.maxStoragePerUser || 5368709120 : 5368709120; // 5GB para usuarios personales
  if ((user.storageUsed || 0) + (doc.size || 0) > maxStorage) {
    throw new HttpError(400, 'Storage quota exceeded');
  }

  // Generar nuevo nombre de archivo para evitar conflictos
  const ext = path.extname(doc.filename || '');
  const basename = path.basename(doc.filename || '', ext);
  const newFilename = `${basename}-copy-${Date.now()}${ext}`;

  // Construir paths
  const safeNewFilename = sanitizePathOrThrow(newFilename, process.cwd());
  const newDocPath = `${targetFolder.path}/${safeNewFilename}`;
  const storageRoot = path.join(process.cwd(), 'storage');

  const sourceRelativePath = (doc.path || '').startsWith('/')
    ? (doc.path || '').substring(1)
    : doc.path || '';
  const targetRelativePath = newDocPath.startsWith('/') ? newDocPath.substring(1) : newDocPath;

  const sourcePhysicalPath = path.join(storageRoot, sourceRelativePath);
  const targetPhysicalPath = path.join(storageRoot, targetRelativePath);

  // Copiar archivo físico
  try {
    if (
      !isPathWithinBase(sourcePhysicalPath, storageRoot) ||
      !isPathWithinBase(targetPhysicalPath, storageRoot)
    ) {
      throw new HttpError(400, 'Invalid destination path');
    }

    if (fs.existsSync(sourcePhysicalPath)) {
      // Asegurar que el directorio destino existe
      const targetDir = path.dirname(targetPhysicalPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(sourcePhysicalPath, targetPhysicalPath);
    } else {
      throw new HttpError(500, 'Source file not found in storage');
    }
  } catch (error: unknown) {
    console.error('File copy error:', getErrorMessage(error));
    throw new HttpError(500, 'Failed to copy file in storage');
  }

  // Crear nuevo documento en BD
  const newDoc = await DocumentModel.create({
    filename: newFilename,
    originalname: `Copy of ${doc.originalname}`,
    mimeType: doc.mimeType,
    size: doc.size,
    uploadedBy: userId,
    folder: targetFolderId,
    organization: doc.organization,
    path: newDocPath,
    url: `/storage${newDocPath}`
  });

  // Actualizar almacenamiento del usuario
  user.storageUsed = (user.storageUsed || 0) + (doc.size || 0);
  await user.save();

  return newDoc;
}

/**
 * Obtener documentos recientes del usuario en su organización activa
 */
export async function getUserRecentDocuments({
  userId,
  limit = 10
}: GetRecentDocumentsDto): Promise<IDocument[]> {
  // Validar que el ID sea ObjectId válido
  if (!isValidObjectId(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }

  // Obtener organización activa del usuario
  const activeOrgId = await getActiveOrganization(userId);

  if (!activeOrgId) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  const orgObjectId = new mongoose.Types.ObjectId(activeOrgId);

  const documents = await DocumentModel.find({
    organization: orgObjectId,
    deletedAt: null // Excluir documentos en papelera
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('folder', 'name displayName path')
    .select(getDocumentSelect('list')) // 🤖 Incluye campos AI explícitamente
    .lean();

  // Agregar campo calculado indicando si es propio o visible por organización
  const documentsWithAccessType = documents.map(doc => ({
    ...doc,
    accessType: doc.uploadedBy.toString() === userId.toString() ? 'owner' : 'org',
    isOwned: doc.uploadedBy.toString() === userId.toString()
  }));

  return documentsWithAccessType as unknown as IDocument[];
}

/**
 * Crear un documento para un archivo subido
 * Valida cuotas de almacenamiento y tipo/tamaño de archivo según el plan de la organización
 * Usa la organización activa y rootFolder de la membresía del usuario
 */
export async function uploadDocument({
  file,
  userId,
  folderId
}: UploadDocumentDto): Promise<IDocument> {
  if (!file || !file.filename) throw new HttpError(400, 'File is required');

  // Obtener usuario
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  // Obtener organización activa (requerida)
  const activeOrgId = await getActiveOrganization(userId);
  if (!activeOrgId) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  // Obtener membresía para acceder al rootFolder
  const membership = await getMembership(userId, activeOrgId);
  if (!membership) {
    throw new HttpError(403, 'You are not a member of this organization');
  }

  // Si no se proporciona folderId, usar rootFolder de la membresía
  let effectiveFolderId = folderId?.trim();
  if (!effectiveFolderId) {
    if (!membership.rootFolder) {
      throw new HttpError(400, 'Membership does not have a root folder. Please contact support.');
    }
    effectiveFolderId = membership.rootFolder.toString();
  }

  if (!isValidObjectId(effectiveFolderId)) {
    throw new HttpError(400, 'Invalid folder ID');
  }

  const folderObjectId = new mongoose.Types.ObjectId(effectiveFolderId);

  // Validar que el usuario tenga acceso de editor a la carpeta
  await validateFolderAccess(folderObjectId.toString(), userId, 'editor');

  const folder = await Folder.findById(folderObjectId);
  if (!folder) throw new HttpError(404, 'Folder not found');

  // Validar que la carpeta pertenece a la organización activa
  if (folder.organization?.toString() !== activeOrgId) {
    throw new HttpError(403, 'Folder does not belong to your active organization');
  }

  // Obtener organización
  const organization = await Organization.findById(activeOrgId);
  if (!organization) throw new HttpError(404, 'Organization not found');

  const fileSize = file.size || 0;

  // Validar tamaño máximo de archivo según el plan
  const planLimits = PLAN_LIMITS[organization.plan];
  if (fileSize > planLimits.maxFileSize) {
    throw new HttpError(
      400,
      `File size exceeds maximum allowed (${planLimits.maxFileSize} bytes) for ${organization.plan} plan`
    );
  }

  // Validar cuota de almacenamiento del usuario
  const maxStoragePerUser = organization.settings.maxStoragePerUser;
  const currentUsage = user.storageUsed || 0;

  if (currentUsage + fileSize > maxStoragePerUser) {
    throw new HttpError(
      403,
      `Storage quota exceeded. Used: ${currentUsage}, Limit: ${maxStoragePerUser} (${organization.plan} plan)`
    );
  }

  // Validar almacenamiento total de la organización
  const totalOrgStorage = await User.aggregate<{ _id: null; total: number }>([
    { $match: { organization: new mongoose.Types.ObjectId(activeOrgId) } },
    { $group: { _id: null, total: { $sum: '$storageUsed' } } }
  ]);

  const currentOrgStorage = totalOrgStorage[0]?.total || 0;
  const maxOrgStorage = organization.settings.maxStorageTotal;

  if (maxOrgStorage !== -1 && currentOrgStorage + fileSize > maxOrgStorage) {
    throw new HttpError(
      403,
      `Organization storage quota exceeded (${maxOrgStorage} bytes for ${organization.plan} plan)`
    );
  }

  // Validar tipo de archivo permitido según el plan
  // Fuente única de verdad: PLAN_LIMITS (no settings de BD, que puede estar desactualizado)
  const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
  const allowedTypes = PLAN_LIMITS[organization.plan].allowedFileTypes;

  if (!allowedTypes.includes('*') && !allowedTypes.includes(fileExt)) {
    throw new HttpError(
      400,
      `File type '${fileExt}' not allowed for ${organization.plan} plan. Allowed types: ${allowedTypes.join(', ')}`
    );
  }

  // Construir path en el sistema de archivos
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const rawFilename = path.basename(file.filename);
  const sanitizedFilename = sanitizePathOrThrow(rawFilename, uploadsRoot);
  const tempPath = path.join(uploadsRoot, sanitizedFilename);

  // Construir paths de destino
  const documentPath = `${folder.path}/${sanitizedFilename}`;
  const storageRoot = path.join(process.cwd(), 'storage');

  const relativeStoragePath = documentPath.startsWith('/')
    ? documentPath.substring(1)
    : documentPath;
  const physicalPath = path.join(storageRoot, relativeStoragePath);

  // Validar que el path de destino está dentro del directorio storage
  // (validación final por defensa en profundidad)
  if (!isPathWithinBase(physicalPath, storageRoot)) {
    throw new HttpError(400, 'Invalid destination path');
  }

  // Mover archivo de uploads a storage
  try {
    // Asegurar que el directorio destino existe
    const destDir = path.dirname(physicalPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    // Multer may store the uploaded file in different places depending on configuration
    // Try a few candidate locations before failing. Also support memory buffer uploads.
    const candidatePaths: string[] = [];
    const uploadsDir = path.join(process.cwd(), 'uploads');

    candidatePaths.push(tempPath);

    // Sanitizar y validar file.path si existe
    if (file.path) {
      const filePath = file.path.toString();
      const resolvedPath = path.resolve(filePath);
      // Validar que está dentro de uploads o temp
      if (
        resolvedPath.startsWith(path.resolve(uploadsDir)) ||
        resolvedPath.startsWith(path.resolve(os.tmpdir()))
      ) {
        candidatePaths.push(resolvedPath);
      }
    }

    // Sanitizar destination + filename si existen
    if (file.destination && file.filename) {
      const destination = file.destination.toString();
      const filename = file.filename.toString();
      const combined = path.join(destination, filename);
      const resolvedCombined = path.resolve(combined);
      // Validar que está dentro de uploads
      if (resolvedCombined.startsWith(path.resolve(uploadsDir))) {
        candidatePaths.push(resolvedCombined);
      }
    }

    let moved = false;
    const storageDir = path.join(process.cwd(), 'storage');

    for (const candidate of candidatePaths) {
      if (!candidate) continue;

      // Sanitizar y resolver el path del candidato
      const resolvedCandidate = path.resolve(candidate);

      // Validar que el candidato está en un directorio permitido (uploads, temp, o storage)
      const isInUploads = resolvedCandidate.startsWith(path.resolve(uploadsDir));
      const isInTemp = resolvedCandidate.startsWith(path.resolve(os.tmpdir()));
      const isInStorage = resolvedCandidate.startsWith(path.resolve(storageDir));

      if (!isInUploads && !isInTemp && !isInStorage) {
        continue; // Skip paths fuera de directorios permitidos
      }

      // Validar que existe y mover
      if (fs.existsSync(resolvedCandidate)) {
        fs.renameSync(resolvedCandidate, physicalPath);
        moved = true;
        break;
      }
    }

    // If not moved and buffer is present (memory storage), write buffer to destination
    if (!moved && file.buffer) {
      fs.writeFileSync(physicalPath, file.buffer);
      moved = true;
    }

    if (!moved) {
      throw new HttpError(500, 'Uploaded file not found in temp directory');
    }
  } catch (error: unknown) {
    console.error('File move error:', getErrorMessage(error));
    throw new HttpError(500, 'Failed to move file to storage');
  }

  // Crear documento en BD
  const docData = {
    filename: sanitizedFilename,
    originalname: file.originalname,
    mimeType: file.mimetype || 'application/octet-stream',
    size: fileSize,
    uploadedBy: userId,
    folder: effectiveFolderId,
    organization: activeOrgId,
    path: documentPath,
    url: `/storage${documentPath}`,
    aiProcessingStatus: 'pending' as const // 🤖 RFE-AI-002: Inicializar en pending para procesamiento AI
  };

  const doc = await DocumentModel.create(docData);

  // Extraer contenido del documento (si es PDF)
  try {
    const extractedContent = await extractContentFromDocument(physicalPath, docData.mimeType);
    if (extractedContent) {
      doc.extractedContent = extractedContent;
      await doc.save();
      console.warn(`✅ Content extracted for document: ${doc.filename}`);
    }
  } catch (error: unknown) {
    console.error(`⚠️  Failed to extract content from ${doc.filename}:`, getErrorMessage(error));
    // No lanzar error, la extracción de contenido no es crítica
  }

  // Actualizar almacenamiento usado del usuario
  user.storageUsed = currentUsage + fileSize;
  await user.save();

  // 🤖 RFE-AI-002: Disparar procesamiento AI asíncrono (no bloquea respuesta al usuario)
  if (textExtractionService.isSupportedMimeType(doc.mimeType)) {
    processDocumentAI(doc._id.toString()).catch((error: unknown) => {
      console.error(
        `[upload] Failed to process document ${String(doc._id)} with AI:`,
        getErrorMessage(error)
      );
    });
  } else {
    console.warn(
      `[upload] Document ${String(doc._id)} has unsupported MIME type for AI processing: ${doc.mimeType}`
    );
  }

  // Indexar documento en Elasticsearch
  try {
    await searchService.indexDocument(doc);
  } catch (error: unknown) {
    console.error('Failed to index document in search:', getErrorMessage(error));
    // No lanzar error para no bloquear la creación del documento
  }

  // NOTE: Upload is private by default now -> do NOT notify entire org on upload.
  return doc;
}

export async function listDocuments(userId: string): Promise<IDocument[]> {
  if (!isValidObjectId(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }

  const activeOrgId = await getActiveOrganization(userId);
  if (!activeOrgId) {
    throw new HttpError(
      403,
      'No existe una organización activa. Por favor, crea o únete a una organización primero.'
    );
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  return DocumentModel.find({
    uploadedBy: userObjectId,
    deletedAt: null // Excluir documentos en papelera
  })
    .populate('folder')
    .select(getDocumentSelect('list')); // 🤖 Incluye campos AI explícitamente
}

export async function findDocumentById(id: string): Promise<IDocument | null> {
  if (!isValidObjectId(id)) {
    throw new HttpError(400, 'Invalid document ID');
  }
  const documentObjectId = new mongoose.Types.ObjectId(id);
  return DocumentModel.findById(documentObjectId);
}

export default {
  shareDocument,
  deleteDocument,
  replaceDocumentFile,
  uploadDocument,
  listDocuments,
  listSharedDocumentsToUser,
  findDocumentById,
  moveDocument,
  copyDocument,
  getUserRecentDocuments
};
