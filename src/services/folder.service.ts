import fs from 'fs';
import path from 'path';
import Folder, { IFolder, FolderPermissionRole } from '../models/folder.model';
import User from '../models/user.model';
import Organization from '../models/organization.model';
import DocumentModel from '../models/document.model';
import type { IDocument } from '../models/document.model';
import HttpError from '../models/error.model';
import mongoose from 'mongoose';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getMongoErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

interface FolderTreeNode {
  _id: mongoose.Types.ObjectId;
  parent?: mongoose.Types.ObjectId | null;
  children: FolderTreeNode[];
  [key: string]: unknown;
}

/**
 * DTO para creación de carpeta
 */
export interface CreateFolderDto {
  name: string;
  displayName?: string;
  owner: string;
  organizationId: string;
  parentId: string; // AHORA OBLIGATORIO
}

/**
 * DTO para eliminación de carpeta
 */
export interface DeleteFolderDto {
  id: string;
  userId: string;
  force?: boolean;
}

/**
 * DTO para renombrado de carpeta
 */
export interface RenameFolderDto {
  id: string;
  userId: string;
  name?: string;
  displayName?: string;
}

/**
 * DTO para compartir carpeta
 */
export interface ShareFolderDto {
  folderId: string;
  userId: string; // Usuario que comparte
  targetUserId: string; // Usuario con quien se comparte
  role?: FolderPermissionRole; // Rol a asignar (por defecto 'viewer')
}

/**
 * DTO para obtener contenido de carpeta
 */
export interface GetFolderContentsDto {
  folderId: string;
  userId: string;
}

/**
 * DTO para obtener árbol de carpetas
 */
export interface GetUserFolderTreeDto {
  userId: string;
  organizationId: string;
}

/**
 * Valida que un usuario tenga acceso a una carpeta con un rol específico
 *
 * @param folderId - ID de la carpeta
 * @param userId - ID del usuario
 * @param requiredRole - Rol mínimo requerido (opcional)
 * @returns true si tiene acceso, lanza error si no
 * @throws HttpError si no tiene acceso
 */
export async function validateFolderAccess(
  folderId: string,
  userId: string,
  requiredRole?: FolderPermissionRole
): Promise<boolean> {
  // Validar que el folderId sea un ObjectId válido y no un objeto de consulta
  if (typeof folderId !== 'string' || !mongoose.Types.ObjectId.isValid(folderId)) {
    throw new HttpError(400, 'Invalid folder ID');
  }

  const folder = await Folder.findById(folderId);

  if (!folder) {
    throw new HttpError(404, 'Folder not found');
  }

  // Usar el método hasAccess del modelo
  const hasAccess = folder.hasAccess(userId, requiredRole);

  if (!hasAccess) {
    throw new HttpError(
      403,
      requiredRole
        ? `User does not have ${requiredRole} access to this folder`
        : 'User does not have access to this folder'
    );
  }

  return true;
}

/**
 * Crea una nueva carpeta en la base de datos y el sistema de archivos
 * Ahora requiere parentId obligatorio
 *
 * @param CreateFolderDto - Datos de la carpeta
 * @returns Carpeta creada
 */
export async function createFolder({
  name,
  displayName,
  owner,
  organizationId,
  parentId
}: CreateFolderDto): Promise<IFolder> {
  if (!name) throw new HttpError(400, 'Folder name is required');
  if (!owner) throw new HttpError(400, 'Owner is required');
  if (!organizationId) throw new HttpError(400, 'Organization ID is required');
  if (!parentId) throw new HttpError(400, 'Parent folder ID is required');

  // Validar que el organizationId sea un ObjectId válido y no un objeto de consulta
  if (typeof organizationId !== 'string' || !mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new HttpError(400, 'Invalid organization ID');
  }

  // Validar que el parentId sea un ObjectId válido y no un objeto de consulta
  if (typeof parentId !== 'string' || !mongoose.Types.ObjectId.isValid(parentId)) {
    throw new HttpError(400, 'Invalid parent folder ID');
  }

  // Validar que el usuario exista
  const user = await User.findById(owner);
  if (!user) throw new HttpError(404, 'Owner user not found');

  // Validar que la organización exista
  const org = await Organization.findById(organizationId);
  if (!org) throw new HttpError(404, 'Organization not found');

  // Validar que la carpeta padre exista y el usuario tenga permisos de editor o owner
  await validateFolderAccess(parentId, owner, 'editor');

  const parentFolder = await Folder.findById(parentId);
  if (!parentFolder) throw new HttpError(404, 'Parent folder not found');

  // Construir el path basado en el padre
  const newPath = `${parentFolder.path}/${name}`;

  try {
    const folder = await Folder.create({
      name,
      displayName: displayName || name,
      type: 'folder',
      owner,
      organization: organizationId,
      parent: parentId,
      path: newPath,
      permissions: [
        {
          userId: new mongoose.Types.ObjectId(owner),
          role: 'owner'
        }
      ]
    });

    // Crear el directorio físico
    const storageRoot = path.join(process.cwd(), 'storage');
    // Sanitizar slug para prevenir path traversal
    const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    // Sanitizar cada componente del path
    const pathComponents = newPath
      .split('/')
      .filter(p => p)
      .map(component => component.replace(/[^a-z0-9_.-]/gi, '-'));
    const folderPath = path.join(storageRoot, safeSlug, ...pathComponents);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    return folder;
  } catch (err: unknown) {
    if (getMongoErrorCode(err) === 11000) {
      throw new HttpError(409, 'Folder name already exists in this location');
    }
    throw err;
  }
}

/**
 * Obtiene el contenido de una carpeta (subcarpetas y documentos)
 *
 * @param GetFolderContentsDto - Parámetros de búsqueda
 * @returns Contenido de la carpeta
 */
export async function getFolderContents({ folderId, userId }: GetFolderContentsDto): Promise<{
  folder: IFolder;
  subfolders: IFolder[];
  documents: IDocument[];
}> {
  // Validar acceso (viewer como mínimo)
  await validateFolderAccess(folderId, userId, 'viewer');

  const folder = await Folder.findById(folderId);
  if (!folder) throw new HttpError(404, 'Folder not found');

  // Convertir IDs a ObjectIds para prevenir inyección NoSQL
  const folderObjectId = new mongoose.Types.ObjectId(folderId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Obtener subcarpetas donde el usuario tiene acceso
  const subfolders = await Folder.find({
    parent: folderObjectId,
    $or: [{ owner: userObjectId }, { 'permissions.userId': userObjectId }]
  }).sort({ name: 1 });

  // Obtener documentos de la carpeta
  const documents = await DocumentModel.find({
    folder: folderObjectId,
    $or: [{ uploadedBy: userObjectId }, { sharedWith: userObjectId }]
  })
    .sort({ createdAt: -1 })
    .select('-__v');

  return {
    folder,
    subfolders,
    documents
  };
}

/**
 * Obtiene el árbol completo de carpetas de un usuario en una organización
 *
 * @param GetUserFolderTreeDto - Parámetros
 * @returns Árbol jerárquico de carpetas
 */
export async function getUserFolderTree({
  userId,
  organizationId
}: GetUserFolderTreeDto): Promise<IFolder | null> {
  // Convertir IDs a ObjectIds para prevenir inyección NoSQL
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);

  // Obtener todas las carpetas donde el usuario tiene acceso
  const folders = await Folder.find({
    organization: orgObjectId,
    $or: [{ owner: userObjectId }, { 'permissions.userId': userObjectId }]
  })
    .sort({ path: 1 });

  if (folders.length === 0) {
    return null;
  }

  // Construir árbol jerárquico
  const folderMap = new Map<string, FolderTreeNode>();
  const rootFolders: FolderTreeNode[] = [];

  // Primero crear el mapa con todos los folders
  folders.forEach(folder => {
    const folderObject = folder.toObject() as Record<string, unknown>;

    folderMap.set(String(folder._id), {
      ...folderObject,
      _id: new mongoose.Types.ObjectId(String(folder._id)),
      parent: folder.parent ? new mongoose.Types.ObjectId(String(folder.parent)) : null,
      children: []
    });
  });

  // Luego construir la jerarquía
  folders.forEach(folder => {
    const folderWithChildren = folderMap.get(String(folder._id));

    if (!folderWithChildren) {
      return;
    }

    if (!folder.parent) {
      // Carpeta raíz
      rootFolders.push(folderWithChildren);
    } else {
      // Carpeta hija
      const parent = folderMap.get(String(folder.parent));
      if (parent) {
        parent.children.push(folderWithChildren);
      }
    }
  });

  // Retornar la primera carpeta raíz (debería haber solo una por usuario)
  return rootFolders.length > 0 ? (rootFolders[0] as unknown as IFolder) : null;
}

/**
 * Comparte una carpeta con otro usuario
 *
 * @param ShareFolderDto - Datos para compartir
 * @returns Carpeta actualizada
 */
export async function shareFolder({
  folderId,
  userId,
  targetUserId,
  role = 'viewer'
}: ShareFolderDto): Promise<IFolder> {
  // Validar que el usuario actual tenga permisos de owner
  await validateFolderAccess(folderId, userId, 'owner');

  const folder = await Folder.findById(folderId);
  if (!folder) throw new HttpError(404, 'Folder not found');

  // Validar que el usuario objetivo exista y esté en la misma organización
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) throw new HttpError(404, 'Target user not found');

  // Validar compatibilidad de organización:
  // - Ambos sin organización: OK (usuarios personales)
  // - Ambos con la misma organización: OK
  // - Uno con org y otro sin org: NO permitido
  // - Diferentes organizaciones: NO permitido
  const folderOrgId = folder.organization?.toString();
  const userOrgId = targetUser.organization?.toString();

  if (folderOrgId !== userOrgId) {
    if (!folderOrgId && !userOrgId) {
      // Ambos son usuarios personales - OK
    } else if (folderOrgId && userOrgId) {
      throw new HttpError(403, 'Users belong to different organizations');
    } else {
      throw new HttpError(403, 'Cannot share between personal and organization users');
    }
  }

  // Usar el método shareWith del modelo
  folder.shareWith(targetUserId, role);
  await folder.save();

  return folder;
}

/**
 * Lista todas las carpetas de un usuario con sus documentos
 * DEPRECATED: Usar getUserFolderTree en su lugar
 *
 * @param owner - ID del propietario
 * @returns Lista de carpetas con documentos populados
 */
export function listFolders(owner: string): Promise<IFolder[]> {
  return Folder.find({ owner }).populate('documents');
}

/**
 * Elimina una carpeta y opcionalmente sus documentos
 *
 * @param DeleteFolderDto - Datos de eliminación
 * @returns Resultado de la operación
 */
export async function deleteFolder({
  id,
  userId,
  force = false
}: DeleteFolderDto): Promise<{ success: boolean }> {
  // Validar que el usuario tenga permisos de owner
  await validateFolderAccess(id, userId, 'owner');

  const folder = await Folder.findById(id);
  if (!folder) throw new HttpError(404, 'Folder not found');

  // Validar que no sea carpeta raíz
  if (folder.type === 'root') {
    throw new HttpError(400, 'Cannot delete root folder');
  }

  if (!force) {
    // Verificar si tiene subcarpetas
    const hasSubfolders = await Folder.exists({ parent: id });
    if (hasSubfolders) {
      throw new HttpError(400, 'Folder contains subfolders');
    }

    // Verificar si tiene documentos
    const hasDocs = await DocumentModel.exists({ folder: id });
    if (hasDocs) {
      throw new HttpError(400, 'Folder is not empty');
    }
  } else {
    // Forzar: elimina subcarpetas recursivamente
    await deleteSubfoldersRecursively(id);

    // Elimina documentos en BD y sus archivos
    const docs = await DocumentModel.find({ folder: id });
    for (const doc of docs) {
      try {
        if (doc.filename) {
          const filePath = path.join(process.cwd(), 'uploads', doc.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (e: unknown) {
        console.error('[force-delete-doc-file-error]', { id: String(doc._id), err: getErrorMessage(e) });
      }
      await DocumentModel.findByIdAndDelete(doc._id);
    }
  }

  await Folder.findByIdAndDelete(id);

  // Elimina el directorio del sistema de archivos
  try {
    const org = await Organization.findById(folder.organization);
    if (org) {
      const storageRoot = path.join(process.cwd(), 'storage');
      // Sanitizar slug y path para prevenir path traversal
      const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
      const pathComponents = folder.path
        .split('/')
        .filter(p => p)
        .map(component => component.replace(/[^a-z0-9_.-]/gi, '-'));
      const folderPath = path.join(storageRoot, safeSlug, ...pathComponents);

      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
    }
  } catch (e: unknown) {
    console.error('[folder-fs-delete-error]', e);
  }

  return { success: true };
}

/**
 * Función auxiliar para eliminar subcarpetas recursivamente
 */
async function deleteSubfoldersRecursively(folderId: string): Promise<void> {
  const subfolders = await Folder.find({ parent: folderId });

  for (const subfolder of subfolders) {
    // Recursión: eliminar subcarpetas de esta subcarpeta
    await deleteSubfoldersRecursively(String(subfolder._id));

    // Eliminar documentos de esta subcarpeta
    const docs = await DocumentModel.find({ folder: subfolder._id });
    for (const doc of docs) {
      try {
        if (doc.filename) {
          const filePath = path.join(process.cwd(), 'uploads', doc.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      } catch (e: unknown) {
        console.error('[recursive-delete-doc-error]', { id: String(doc._id), err: getErrorMessage(e) });
      }
      await DocumentModel.findByIdAndDelete(doc._id);
    }

    // Eliminar la subcarpeta
    await Folder.findByIdAndDelete(subfolder._id);
  }
}

export async function renameFolder({
  id,
  userId,
  name,
  displayName
}: RenameFolderDto): Promise<IFolder> {
  if (!name && !displayName) {
    throw new HttpError(400, 'At least one of name or displayName is required');
  }

  // Validar que el usuario tenga permisos de editor o owner
  await validateFolderAccess(id, userId, 'editor');

  const folder = await Folder.findById(id);
  if (!folder) throw new HttpError(404, 'Folder not found');

  // Validar que no sea carpeta raíz (solo se puede cambiar displayName)
  if (folder.type === 'root' && name !== undefined && name !== folder.name) {
    throw new HttpError(400, 'Cannot rename root folder technical name, use displayName instead');
  }

  // Usar el nombre actual si no se proporciona uno nuevo
  const newName = name ?? folder.name;
  const oldPath = folder.path;
  const newPath = folder.parent
    ? `${oldPath.substring(0, oldPath.lastIndexOf('/'))}/${newName}`
    : `/${newName}`;

  try {
    // Actualizar primero en BD para validar unicidad
    if (name !== undefined) {
      folder.name = name;
    }
    if (displayName !== undefined) {
      folder.displayName = displayName;
    }
    folder.path = newPath;
    await folder.save();
  } catch (err: unknown) {
    if (getMongoErrorCode(err) === 11000) {
      throw new HttpError(409, 'Folder name already exists in this location');
    }
    throw err;
  }

  // Actualizar paths de todas las subcarpetas recursivamente
  await updateSubfolderPaths(id, oldPath, newPath);

  // Renombrar directorio en el sistema de archivos
  try {
    const org = await Organization.findById(folder.organization);
    if (org) {
      const storageRoot = path.join(process.cwd(), 'storage');
      // Sanitizar slug y paths para prevenir path traversal
      const safeSlug = org.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
      const oldPathComponents = oldPath
        .split('/')
        .filter(p => p)
        .map(component => component.replace(/[^a-z0-9_.-]/gi, '-'));
      const newPathComponents = newPath
        .split('/')
        .filter(p => p)
        .map(component => component.replace(/[^a-z0-9_.-]/gi, '-'));
      const oldFolderPath = path.join(storageRoot, safeSlug, ...oldPathComponents);
      const newFolderPath = path.join(storageRoot, safeSlug, ...newPathComponents);

      if (fs.existsSync(oldFolderPath) && oldFolderPath !== newFolderPath) {
        fs.renameSync(oldFolderPath, newFolderPath);
      } else if (!fs.existsSync(newFolderPath)) {
        fs.mkdirSync(newFolderPath, { recursive: true });
      }
    }
  } catch (e: unknown) {
    console.error('[folder-fs-rename-error]', e);
  }

  return folder;
}

/**
 * Función auxiliar para actualizar paths de subcarpetas recursivamente
 */
async function updateSubfolderPaths(
  folderId: string,
  oldParentPath: string,
  newParentPath: string
): Promise<void> {
  const subfolders = await Folder.find({ parent: folderId });

  for (const subfolder of subfolders) {
    const oldPath = subfolder.path;
    const newPath = oldPath.replace(oldParentPath, newParentPath);

    subfolder.path = newPath;
    await subfolder.save();

    // Recursión: actualizar subcarpetas de esta subcarpeta
    await updateSubfolderPaths(String(subfolder._id), oldPath, newPath);
  }
}

export default {
  createFolder,
  listFolders,
  deleteFolder,
  renameFolder,
  validateFolderAccess,
  getFolderContents,
  getUserFolderTree,
  shareFolder
};
