import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import HttpError from '../models/error.model';

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Forbidden'));
  }
  next();
}

export default { requireAdmin };
