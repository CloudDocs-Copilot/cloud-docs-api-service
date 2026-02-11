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
import { getMembership, getActiveOrganization } from './membership.service';
import { PLAN_LIMITS } from '../models/types/organization.types';
import * as searchService from './search.service';

/**
 * Valida si un string es un ObjectId válido de MongoDB
 * 
 * @param id - String a validar
 * @returns true si es un ObjectId válido
 */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
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
export async function shareDocument({ id, userId, userIds }: ShareDocumentDto): Promise<IDocument | null> {
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
  if (filteredIds.length === 0) throw new HttpError(400, 'Cannot share document with yourself as the owner');

  // Convertir strings a ObjectIds para prevenir inyección NoSQL
  const filteredObjectIds = filteredIds.map(id => new mongoose.Types.ObjectId(id));

  // Opcionalmente, filtra solo usuarios existentes
  const existingUsers = await User.find({ _id: { $in: filteredObjectIds } }, { _id: 1 }).lean();
  const existingIds = existingUsers.map(u => u._id);
  if (existingIds.length === 0) throw new HttpError(400, 'No valid users found to share with');

  const updated = await DocumentModel.findByIdAndUpdate(
    id,
    { $addToSet: { sharedWith: { $each: existingIds } } },
    { new: true }
  );
  return updated;
}

/**
 * Eliminar un documento si el usuario es propietario
 */
export async function deleteDocument({ id, userId }: DeleteDocumentDto): Promise<IDocument | null> {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  const doc = await DocumentModel.findById(id);
  if (!doc) throw new Error('Document not found');
  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Elimina el archivo físico
  try {
    if (doc.filename && doc.organization) {
      const org = await Organization.findById(doc.organization);
      if (org && doc.path) {
        const storageRoot = path.join(process.cwd(), 'storage');
        // Sanitizar org.slug para prevenir path traversal
        const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
        // Sanitizar componentes del path
        const pathComponents = doc.path.split('/').filter(p => p).map(component => 
          component.replace(/[^a-z0-9_.-]/gi, '-')
        );
        const filePath = path.join(storageRoot, safeSlug, ...pathComponents);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
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
  } catch (e: any) {
    console.error('File deletion error:', e.message);
  }

  // Actualizar almacenamiento usado del usuario
  const user = await User.findById(userId);
  if (user && doc.size) {
    user.storageUsed = Math.max(0, (user.storageUsed || 0) - doc.size);
    await user.save();
  }

  const deleted = await DocumentModel.findByIdAndDelete(id);
  
  // Eliminar documento del índice de Elasticsearch
  if (deleted) {
    try {
      await searchService.removeDocumentFromIndex(id);
    } catch (error: any) {
      console.error('Failed to remove document from search index:', error.message);
      // No lanzar error para no bloquear la eliminación
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

  // Obtener organización si existe
  let org = null;
  if (doc.organization) {
    org = await Organization.findById(doc.organization);
    if (!org) throw new HttpError(404, 'Organization not found');
  }

  // Construir nuevo path
  const storageRoot = path.join(process.cwd(), 'storage');
  const safeFilename = sanitizePathOrThrow(doc.filename || '', storageRoot);
  const newDocPath = `${targetFolder.path}/${safeFilename}`;
  
  // Sanitizar paths para prevenir path traversal
  // Si no hay organización, usar 'users' como slug
  const safeSlug = org 
    ? org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    : 'users';
  const oldPathComponents = (doc.path || '').split('/').filter(p => p).map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '-')
  );
  const newPathComponents = newDocPath.split('/').filter(p => p).map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '-')
  );
  
  const oldPhysicalPath = path.join(storageRoot, safeSlug, ...oldPathComponents);
  const newPhysicalPath = path.join(storageRoot, safeSlug, ...newPathComponents);

  // Mover archivo físico
  try {
    if (fs.existsSync(oldPhysicalPath)) {
      // Asegurar que el directorio destino existe
      const newDir = path.dirname(newPhysicalPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }
      
      fs.renameSync(oldPhysicalPath, newPhysicalPath);
    }
  } catch (e: any) {
    console.error('File move error:', e.message);
    throw new HttpError(500, 'Failed to move file in storage');
  }

  // Actualizar documento en BD
  doc.folder = targetFolder._id as mongoose.Types.ObjectId;
  doc.path = newDocPath;
  doc.url = `/storage/${safeSlug}${newDocPath}`;
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

  // Usuario debe tener acceso al documento original (owner o shared)
  const hasAccess = String(doc.uploadedBy) === String(userId) ||
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

  const maxStorage = org ? (org.settings.maxStoragePerUser || 5368709120) : 5368709120; // 5GB para usuarios personales
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
  
  // Sanitizar paths para prevenir path traversal
  // Si no hay organización, usar 'users' como slug
  const safeSlug = org 
    ? org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    : 'users';
  const sourcePathComponents = (doc.path || '').split('/').filter(p => p).map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '-')
  );
  const targetPathComponents = newDocPath.split('/').filter(p => p).map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '-')
  );
  
  const sourcePhysicalPath = path.join(storageRoot, safeSlug, ...sourcePathComponents);
  const targetPhysicalPath = path.join(storageRoot, safeSlug, ...targetPathComponents);

  // Copiar archivo físico
  try {
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
  } catch (e: any) {
    console.error('File copy error:', e.message);
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
    url: `/storage/${safeSlug}${newDocPath}`
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
    throw new HttpError(403, 'No active organization. Please create or join an organization first.');
  }

  // Convertir a ObjectId para asegurar tipos seguros en la query
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const orgObjectId = new mongoose.Types.ObjectId(activeOrgId);

  const documents = await DocumentModel.find({
    organization: orgObjectId,
    $or: [
      { uploadedBy: userObjectId },
      { sharedWith: userObjectId }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('folder', 'name displayName path')
  .select('-__v')
  .lean();

  // Agregar campo calculado indicando si es propio o compartido
  const documentsWithAccessType = documents.map(doc => ({
    ...doc,
    accessType: doc.uploadedBy.toString() === userId.toString() ? 'owner' : 'shared',
    isOwned: doc.uploadedBy.toString() === userId.toString()
  }));

  return documentsWithAccessType as any;
}

/**
 * Crear un documento para un archivo subido
 * Valida cuotas de almacenamiento y tipo/tamaño de archivo según el plan de la organización
 * Usa la organización activa y rootFolder de la membresía del usuario
 */
export async function uploadDocument({ 
  file, 
  userId, 
  folderId,
}: UploadDocumentDto): Promise<IDocument> {
  if (!file || !file.filename) throw new HttpError(400, 'File is required');

  // Obtener usuario
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  // Obtener organización activa (requerida)
  const activeOrgId = await getActiveOrganization(userId);
  if (!activeOrgId) {
    throw new HttpError(403, 'No active organization. Please create or join an organization first.');
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
  const totalOrgStorage = await User.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(activeOrgId) } },
    { $group: { _id: null, total: { $sum: '$storageUsed' } } }
  ]);

  const currentOrgStorage = totalOrgStorage[0]?.total || 0;
  const maxOrgStorage = organization.settings.maxStorageTotal;

  if (maxOrgStorage !== -1 && (currentOrgStorage + fileSize) > maxOrgStorage) {
    throw new HttpError(
      403,
      `Organization storage quota exceeded (${maxOrgStorage} bytes for ${organization.plan} plan)`
    );
  }

  // Validar tipo de archivo permitido según el plan
  const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
  const allowedTypes = organization.settings.allowedFileTypes;

  if (!allowedTypes.includes('*') && !allowedTypes.includes(fileExt)) {
    throw new HttpError(
      400,
      `File type '${fileExt}' not allowed for ${organization.plan} plan. Allowed types: ${allowedTypes.join(', ')}`
    );
  }

  // Construir path en el sistema de archivos
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const sanitizedFilename = sanitizePathOrThrow(file.filename, uploadsRoot);
  const tempPath = path.join(uploadsRoot, sanitizedFilename);
  
  // Construir paths de destino
  const documentPath = `${folder.path}/${sanitizedFilename}`;
  const storageRoot = path.join(process.cwd(), 'storage');
  
  // Sanitizar org.slug y folder.path para prevenir path traversal
  const safeSlug = organization.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const folderPathComponents = folder.path.split('/').filter(p => p).map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '-')
  );
  
  const physicalPath = path.join(
    storageRoot, 
    safeSlug,
    ...folderPathComponents,
    sanitizedFilename
  );

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
    if ((file as any).path) {
      const filePath = (file as any).path.toString();
      const resolvedPath = path.resolve(filePath);
      // Validar que está dentro de uploads o temp
      if (resolvedPath.startsWith(path.resolve(uploadsDir)) || 
          resolvedPath.startsWith(path.resolve(os.tmpdir()))) {
        candidatePaths.push(resolvedPath);
      }
    }
    
    // Sanitizar destination + filename si existen
    if ((file as any).destination && (file as any).filename) {
      const destination = (file as any).destination.toString();
      const filename = (file as any).filename.toString();
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
    if (!moved && (file as any).buffer) {
      fs.writeFileSync(physicalPath, (file as any).buffer as Buffer);
      moved = true;
    }

    if (!moved) {
      throw new HttpError(500, 'Uploaded file not found in temp directory');
    }
  } catch (error: any) {
    console.error('File move error:', error.message);
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
    url: `/storage/${safeSlug}${documentPath}`
  };

  const doc = await DocumentModel.create(docData);

  // Actualizar almacenamiento usado del usuario
  user.storageUsed = currentUsage + fileSize;
  await user.save();

  // Indexar documento en Elasticsearch
  try {
    await searchService.indexDocument(doc);
  } catch (error: any) {
    console.error('Failed to index document in search:', error.message);
    // No lanzar error para no bloquear la creación del documento
  }

  return doc;
}

export function listDocuments(userId: string): Promise<IDocument[]> {
  if (!isValidObjectId(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);
  return DocumentModel.find({ uploadedBy: userObjectId }).populate('folder');
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
  uploadDocument,
  listDocuments,
  findDocumentById,
  moveDocument,
  copyDocument,
  getUserRecentDocuments
};
