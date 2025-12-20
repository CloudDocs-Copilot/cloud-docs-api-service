import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as folderService from '../services/folder.service';

/**
 * Controlador para crear una nueva carpeta
 */
export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const folder = await folderService.createFolder({
      name: req.body.name,
      owner: req.user!.id
    });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para listar carpetas del usuario
 */
export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const folders = await folderService.listFolders(req.user!.id);
    res.json(folders);
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
      id: req.params.id,
      owner: req.user!.id,
      force
    });
    
    res.json({ message: 'Folder deleted successfully', ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para renombrar una carpeta
 */
export async function rename(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const folder = await folderService.renameFolder({
      id: req.params.id,
      owner: req.user!.id,
      name: req.body.name
    });
    res.json(folder);
  } catch (err) {
    next(err);
  }
}

export default { create, list, remove, rename };
