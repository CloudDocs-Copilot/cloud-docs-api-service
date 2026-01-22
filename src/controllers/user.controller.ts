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
 * Controlador para obtener el perfil del usuario autenticado
 */
export async function getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      return next(new HttpError(401, 'User not authenticated'));
    }
    const user = await userService.getUserById(req.user.id);
    res.json(user);
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
 * Controlador para actualizar datos de usuario (perfil y preferencias)
 */
export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    // Permitir actualización parcial
    const { name, email, preferences } = req.body;
    
    const user = await userService.updateUser(req.params.id, { name, email, preferences });
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
 * Controlador para que un usuario elimine su propia cuenta
 */
export async function deleteSelf(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Verificar que el usuario autenticado es el mismo que solicita borrar
    // Nota: La ruta debería ser /me o validar el ID
    const userIdToDelete = req.params.id === 'me' ? req.user?.id : req.params.id;

    if (!userIdToDelete) {
       return next(new HttpError(401, 'Unauthorized'));
    }

    if (req.user?.id !== userIdToDelete) {
      return next(new HttpError(403, 'You can only delete your own account'));
    }

    const user = await userService.deleteUser(userIdToDelete);
    res.json({ message: 'Account deleted successfully', user });
  } catch(err) {
    next(err);
  }
}

/**
 * Controlador para actualizar el avatar del usuario
 * Soporta URL directa o archivo subido via Multer
 */
export async function updateAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id) {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    let avatarPath: string | undefined;

    // Caso 1: Archivo subido (multipart/form-data)
    if (req.file) {
      // Generar URL relativa accesible públicamente (asumiendo que se sirve 'uploads' o similar)
      // Ojo: En un entorno real esto iría a S3/Cloudinary. Aqui guardamos el nombre del archivo.
      avatarPath = `/uploads/${req.file.filename}`;
    } 
    // Caso 2: URL enviada en el cuerpo (json)
    else if (req.body.avatar !== undefined) {
      avatarPath = req.body.avatar;
    }

    if (avatarPath === undefined) {
      return next(new HttpError(400, 'Avatar file or URL is required'));
    }
    
    const user = await userService.updateAvatar(req.params.id, { avatar: avatarPath });
    res.json({ message: 'Avatar updated successfully', user });
  } catch (err: any) {
    const status = err.message === 'User not found' ? 404 : 400;
    next(new HttpError(status, err.message));
  }
}

export default { list, getProfile, activate, deactivate, update, changePassword, remove, deleteSelf, updateAvatar };
