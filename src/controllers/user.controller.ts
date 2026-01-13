import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';
import HttpError from '../models/error.model';

/**
 * Controlador para listar todos los usuarios (solo admin)
 */
export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para activar un usuario
 */
export async function activate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.setUserActive(req.params.id, true);
    res.json({ message: 'User activated', user });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para desactivar un usuario
 */
export async function deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.id === req.params.id) {
      return next(new HttpError(400, 'Cannot deactivate self'));
    }
    const user = await userService.setUserActive(req.params.id, false);
    res.json({ message: 'User deactivated', user });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para actualizar datos de usuario
 */
export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    const { name, email } = req.body;
    if (!name || !email) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ message: 'User updated successfully', user });
  } catch (err: any) {
    const status = err.message === 'User not found' ? 404 : 400;
    next(new HttpError(status, err.message));
  }
}

/**
 * Controlador para cambiar contraseña de usuario
 * Valida la fortaleza de la nueva contraseña
 */
export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    const result = await userService.changePassword(req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message === 'User not found') {
      return next(new HttpError(404, err.message));
    }
    if (err.message.includes('incorrect')) {
      return next(new HttpError(401, err.message));
    }
    if (err.message.includes('Password validation failed')) {
      return next(new HttpError(400, err.message));
    }
    next(new HttpError(400, err.message));
  }
}

/**
 * Controlador para eliminar un usuario (solo admin)
 */
export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id === req.params.id) {
      return next(new HttpError(400, 'Cannot delete self'));
    }
    
    const user = await userService.deleteUser(req.params.id);
    res.json({ message: 'User deleted', user });
  } catch (err) {
    next(err);
  }
}

/**
 * Controlador para actualizar el avatar del usuario
 * Solo el propio usuario puede actualizar su avatar
 */
export async function updateAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id) {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    const { avatar } = req.body;
    if (avatar === undefined || avatar === null) {
      return next(new HttpError(400, 'Avatar URL is required'));
    }
    
    const user = await userService.updateAvatar(req.params.id, { avatar });
    res.json({ message: 'Avatar updated successfully', user });
  } catch (err: any) {
    const status = err.message === 'User not found' ? 404 : 400;
    next(new HttpError(status, err.message));
  }
}

export default { list, activate, deactivate, update, changePassword, remove, updateAvatar };
