import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as userService from '../services/user.service';
import HttpError from '../models/error.model';

export async function list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function activate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.setUserActive(req.params.id, true);
    res.json({ message: 'User activated', user });
  } catch (err) {
    next(err);
  }
}

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

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    const { name, email } = req.body;
    if (!name || !email) {
      return next(new HttpError(400, 'Missing required fields'));
    }
    
    console.log(name, email);
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ message: 'User updated successfully', user });
  } catch (err: any) {
    const status = err.message === 'User not found' ? 404 : 400;
    next(new HttpError(status, err.message));
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id !== req.params.id && req.user.role !== 'admin') {
      return next(new HttpError(403, 'Forbidden'));
    }
    
    const result = await userService.changePassword(req.params.id, req.body);
    res.json(result);
  } catch (err: any) {
    const status = err.message === 'User not found' ? 404 : err.message.includes('incorrect') ? 401 : 400;
    next(new HttpError(status, err.message));
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.id === req.params.id) {
      return next(new HttpError(400, 'Cannot delete self')); // resguardo de seguridad
    }
    
    const user = await userService.deleteUser(req.params.id);
    res.json({ message: 'User deleted', user });
  } catch (err) {
    next(err);
  }
}

export default { list, activate, deactivate, update, changePassword, remove };
