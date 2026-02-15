import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as folderService from '../services/folder.service';
import HttpError from '../models/error.model';
import mongoose from 'mongoose';

/**
 * Controlador para crear una nueva carpeta
 */
export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, displayName, organizationId, parentId } = req.body;

    if (!name) {
      return next(new HttpError(400, 'Folder name is required'));
    }

    if (!organizationId) {
      return next(new HttpError(400, 'Organization ID is required'));
    }

    if (!parentId) {
      return next(new HttpError(400, 'Parent folder ID is required'));
    }

    const folder = await folderService.createFolder({
      name,
      displayName,
      owner: req.user!.id,
      organizationId,
      parentId
    });

    res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      folder
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para obtener el árbol de carpetas del usuario
 */
export async function getUserTree(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.query.organizationId as string;

    if (!organizationId) {
      return next(new HttpError(400, 'Organization ID is required'));
    }

    if (typeof organizationId !== 'string' || !mongoose.Types.ObjectId.isValid(organizationId)) {
      return next(new HttpError(400, 'Invalid Organization ID'));
    }

    const normalizedOrganizationId = new mongoose.Types.ObjectId(organizationId).toString();

    const tree = await folderService.getUserFolderTree({
      userId: req.user!.id,
      organizationId: normalizedOrganizationId
    });

    if (!tree) {
      return next(new HttpError(404, 'User has no root folder in this organization'));
    }

    res.json({
      success: true,
      tree
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para obtener el contenido de una carpeta
 */
export async function getContents(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contents = await folderService.getFolderContents({
      folderId: req.params.id as string,
      userId: req.user!.id
    });

    res.json({
      success: true,
      contents
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para compartir una carpeta con otros usuarios
 */
export async function share(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, targetUserId, role } = req.body;
    const userIdToShare = targetUserId || userId; // Aceptar ambos nombres

    if (!userIdToShare) {
      return next(new HttpError(400, 'Target user ID is required'));
    }

    if (typeof userIdToShare !== 'string' || !mongoose.Types.ObjectId.isValid(userIdToShare)) {
      return next(new HttpError(400, 'Invalid target user ID'));
    }

    const normalizedTargetUserId = new mongoose.Types.ObjectId(userIdToShare).toString();

    if (role === undefined || role === null) {
      return next(new HttpError(400, 'Role is required'));
    }

    // Convertir role numérico a string: 1=viewer, 2=editor, 3=owner
    let roleString: string;
    if (typeof role === 'number') {
      if (role === 1) roleString = 'viewer';
      else if (role === 2) roleString = 'editor';
      else if (role === 3) return next(new HttpError(400, 'Cannot share folder with owner role'));
      else return next(new HttpError(400, 'Invalid role value'));
    } else if (typeof role === 'string') {
      if (!['viewer', 'editor'].includes(role)) {
        return next(new HttpError(400, 'Valid role (viewer/editor) is required'));
      }
      roleString = role;
    } else {
      return next(new HttpError(400, 'Role must be a number (1=viewer, 2=editor) or string'));
    }

    const folder = await folderService.shareFolder({
      folderId: String(req.params.id),
      userId: req.user!.id,
      targetUserId: normalizedTargetUserId,
      role: roleString as 'viewer' | 'editor'
    });

    res.json({
      success: true,
      message: 'Folder shared successfully',
      folder
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para listar carpetas del usuario (DEPRECATED - usar getUserTree)
 */
export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const folders = await folderService.listFolders(req.user!.id);

    res.json({
      success: true,
      count: folders.length,
      folders
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para renombrar una carpeta
 */
export async function rename(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, displayName } = req.body;

    if (!name && !displayName) {
      return next(new HttpError(400, 'Name or displayName is required'));
    }

    const folder = await folderService.renameFolder({
      id: String(req.params.id),
      userId: req.user!.id,
      name,
      displayName
    });

    res.json({
      success: true,
      message: 'Folder renamed successfully',
      folder
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para eliminar una carpeta
 */
export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const forceParam = (req.query && req.query.force) || 'false';
    const force = String(forceParam).toLowerCase() === 'true' || String(forceParam) === '1';

    const result = await folderService.deleteFolder({
      id: String(req.params.id),
      userId: req.user!.id,
      force
    });

    res.json({
      message: 'Folder deleted successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

export default { create, getUserTree, getContents, share, list, rename, remove };
