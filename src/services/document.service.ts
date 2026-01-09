import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import DocumentModel, { IDocument } from '../models/document.model';
import Folder from '../models/folder.model';
import User from '../models/user.model';
import Organization from '../models/organization.model';
import HttpError from '../models/error.model';
import { sanitizePathOrThrow, isPathWithinBase } from '../utils/path-sanitizer';
import { validateFolderAccess } from './folder.service';

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
  folderId: string; // AHORA OBLIGATORIO
  organizationId: string;
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
  organizationId: string;
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

  // Validar que la carpeta destino esté en la misma organización
  if (doc.organization?.toString() !== targetFolder.organization.toString()) {
    throw new HttpError(400, 'Cannot move document to folder in different organization');
  }

  const org = await Organization.findById(doc.organization);
  if (!org) throw new HttpError(404, 'Organization not found');

  // Construir nuevo path
  const storageRoot = path.join(process.cwd(), 'storage');
  const safeFilename = sanitizePathOrThrow(doc.filename || '', storageRoot);
  const newDocPath = `${targetFolder.path}/${safeFilename}`;
  
  // Sanitizar paths para prevenir path traversal
  const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
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

  // Validar que la carpeta destino esté en la misma organización
  if (doc.organization?.toString() !== targetFolder.organization.toString()) {
    throw new HttpError(400, 'Cannot copy document to folder in different organization');
  }

  const org = await Organization.findById(doc.organization);
  if (!org) throw new HttpError(404, 'Organization not found');

  // Validar cuota de almacenamiento del usuario
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const maxStorage = org.settings.maxStoragePerUser || 5368709120;
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
  const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
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
 * Obtener documentos recientes del usuario
 */
export async function getUserRecentDocuments({
  userId,
  organizationId,
  limit = 10
}: GetRecentDocumentsDto): Promise<IDocument[]> {
  // Validar que los IDs sean ObjectIds válidos para prevenir inyección NoSQL
  if (!isValidObjectId(userId)) {
    throw new HttpError(400, 'Invalid user ID');
  }
  if (!isValidObjectId(organizationId)) {
    throw new HttpError(400, 'Invalid organization ID');
  }

  // Convertir a ObjectId para asegurar tipos seguros en la query
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);

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
  .select('-__v');

  return documents;
}

/**
 * Crear un documento para un archivo subido
 * Ahora requiere folderId obligatorio
 * Valida cuotas de almacenamiento
 * Guarda en estructura organizada
 */
export async function uploadDocument({ 
  file, 
  userId, 
  folderId,
  organizationId 
}: UploadDocumentDto): Promise<IDocument> {
  if (!file || !file.filename) throw new HttpError(400, 'File is required');
  if (!folderId) throw new HttpError(400, 'Folder ID is required');
  if (!organizationId) throw new HttpError(400, 'Organization ID is required');

  if (!isValidObjectId(folderId)) {
    throw new HttpError(400, 'Invalid folder ID');
  }
  if (!isValidObjectId(organizationId)) {
    throw new HttpError(400, 'Invalid organization ID');
  }

  const folderObjectId = new mongoose.Types.ObjectId(folderId);
  const organizationObjectId = new mongoose.Types.ObjectId(organizationId);

  // Validar que el usuario tenga acceso de editor a la carpeta
  await validateFolderAccess(folderObjectId.toString(), userId, 'editor');

  // Obtener información del usuario, carpeta y organización
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'User not found');

  const folder = await Folder.findById(folderObjectId);
  if (!folder) throw new HttpError(404, 'Folder not found');

  const organization = await Organization.findById(organizationObjectId);
  if (!organization) throw new HttpError(404, 'Organization not found');

  // Validar que la organización del folder coincida
  if (folder.organization.toString() !== organizationObjectId.toString()) {
    throw new HttpError(400, 'Folder does not belong to this organization');
  }

  const fileSize = file.size || 0;

  // Validar cuota de almacenamiento del usuario
  const maxStoragePerUser = organization.settings.maxStoragePerUser || 5368709120; // 5GB default
  const currentUsage = user.storageUsed || 0;

  if (currentUsage + fileSize > maxStoragePerUser) {
    throw new HttpError(
      403,
      `Storage quota exceeded. Current: ${currentUsage}, Max: ${maxStoragePerUser}, Attempted: ${fileSize}`
    );
  }

  // Validar tipo de archivo permitido
  const allowedTypes = organization.settings.allowedFileTypes || ['*'];
  const fileMimeType = file.mimetype || 'application/octet-stream';

  if (!allowedTypes.includes('*')) {
    const isAllowed = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        // Tipo comodín (ej: image/*)
        const prefix = type.slice(0, -2);
        return fileMimeType.startsWith(prefix);
      }
      return fileMimeType === type;
    });

    if (!isAllowed) {
      throw new HttpError(403, `File type ${fileMimeType} is not allowed`);
    }
  }

  // Construir path en el sistema de archivos
  // Sanitizar filename (multer genera UUID, pero sanitizamos por defensa en profundidad)
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
  
  // Asegurar que el directorio existe
  const dirPath = path.dirname(physicalPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Mover archivo
  if (fs.existsSync(tempPath)) {
    fs.renameSync(tempPath, physicalPath);
  } else {
    throw new HttpError(500, 'Uploaded file not found in temp directory');
  }

  // Crear documento en BD
  const docData = {
    filename: sanitizedFilename,
    originalname: file.originalname,
    mimeType: fileMimeType,
    size: fileSize,
    uploadedBy: userId,
    folder: folderId,
    organization: organizationId,
    path: documentPath,
    url: `/storage/${safeSlug}${documentPath}`
  };

  const doc = await DocumentModel.create(docData);

  // Actualizar almacenamiento usado del usuario
  user.storageUsed = currentUsage + fileSize;
  await user.save();

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
