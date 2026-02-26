import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';
import { UpdateUserDto, ChangePasswordDto, UpdateAvatarDto } from '../services/user.service';
import HttpError from '../models/error.model';

/**
 * Controlador para listar todos los usuarios (solo admin)
 */
export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para obtener el perfil del usuario autenticado
 */
export async function getProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.id) {
      return next(new HttpError(401, 'User not authenticated'));
    }
    const user = await userService.getUserById(req.user.id);
    res.json(user);
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para activar un usuario
 */
export async function activate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.setUserActive(String(req.params.id), true);
    res.json({ message: 'User activated', user });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para desactivar un usuario
 */
export async function deactivate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user?.id === req.params.id) {
      return next(new HttpError(400, 'Cannot deactivate self'));
    }
    const user = await userService.setUserActive(String(req.params.id), false);
    res.json({ message: 'User deactivated', user });
  } catch (err: unknown) {
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
    const updateData: UpdateUserDto = {};
    const body = req.body as Record<string, unknown>;
    
    if ('name' in body && body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return next(new HttpError(400, 'Name must be a string'));
      }
      updateData.name = body.name;
    }
    if ('email' in body && body.email !== undefined) {
      if (typeof body.email !== 'string') {
        return next(new HttpError(400, 'Email must be a string'));
      }
      updateData.email = body.email;
    }
    if ('preferences' in body && body.preferences !== undefined) {
      updateData.preferences = body.preferences as UpdateUserDto['preferences'];
    }

    const user = await userService.updateUser(String(req.params.id), updateData);
    res.json({ message: 'User updated successfully', user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === 'User not found' ? 404 : 400;
    next(new HttpError(status, msg));
  }
}

/**
 * Controlador para cambiar contraseña de usuario
 * Valida la fortaleza de la nueva contraseña
 */
export async function changePassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }

    const body = req.body as Record<string, unknown>;
    
    if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
      return next(new HttpError(400, 'currentPassword and newPassword must be strings'));
    }
    
    const passwordData: ChangePasswordDto = {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword
    };

    const result = await userService.changePassword(String(req.params.id), passwordData);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'User not found') {
      return next(new HttpError(404, msg));
    }
    if (msg.includes('incorrect')) {
      return next(new HttpError(401, msg));
    }
    if (msg.includes('Password validation failed')) {
      return next(new HttpError(400, msg));
    }
    next(new HttpError(400, msg));
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

    const user = await userService.deleteUser(String(req.params.id));
    res.json({ message: 'User deleted', user });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para que un usuario elimine su propia cuenta
 */
export async function deleteSelf(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Controlador para actualizar el avatar del usuario
 * Soporta URL directa o archivo subido via Multer
 */
export async function updateAvatar(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id) {
      return next(new HttpError(403, 'Forbidden'));
    }

    let avatarPath: string | undefined;

    // Caso 1: Archivo subido (multipart/form-data)
    if (req.file) {
      avatarPath = `/uploads/${req.file.filename}`;
    }
    // Caso 2: URL enviada en el cuerpo (json)
    else if (req.body && typeof req.body === 'object' && 'avatar' in req.body) {
      const avatarValue = (req.body as Record<string, unknown>).avatar;
      if (avatarValue === null) {
        return next(new HttpError(400, 'Avatar URL is required'));
      }
      if (typeof avatarValue === 'string') {
        avatarPath = avatarValue;
      }
    }

    if (avatarPath === undefined) {
      return next(new HttpError(400, 'Avatar file or URL is required'));
    }

    const avatarDto: UpdateAvatarDto = { avatar: avatarPath };
    const user = await userService.updateAvatar(String(req.params.id), avatarDto);
    res.json({ message: 'Avatar updated successfully', user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg === 'User not found' ? 404 : 400;
    next(new HttpError(status, msg));
  }
}

/**
 * Controlador para buscar usuarios por email.
 * Consulta: GET /api/users/search?email=xxx[&organizationId=yyy]
 */
export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = (req.query.email as string) || '';
    if (!email || !email.trim()) {
      return next(new HttpError(400, 'Query parameter "email" is required'));
    }

    // Validar que organizationId sea un string, no un objeto (prevenir NoSQL injection)
    let organizationId: string | undefined;
    if (req.query.organizationId) {
      if (typeof req.query.organizationId !== 'string') {
        return next(new HttpError(400, 'Invalid organizationId parameter'));
      }
      organizationId = req.query.organizationId;
    }

    const users = await userService.findUsersByEmail(email, {
      organizationId,
      excludeOrganizationMembers: true,
      excludeUserId: req.user?.id
    });

    // Mapear campos expuestos al frontend
    const result = users.map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      organization: u.organization,
      avatar: u.avatar,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    }));

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    next(err);
  }
}

export default {
  list,
  getProfile,
  activate,
  deactivate,
  update,
  changePassword,
  remove,
  deleteSelf,
  updateAvatar,
  search
};
