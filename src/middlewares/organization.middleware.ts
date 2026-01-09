import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import HttpError from '../models/error.model';
import Organization from '../models/organization.model';

/**
 * Middleware para validar que el usuario pertenece a la organización especificada
 * 
 * Uso:
 * - En rutas que requieren organizationId en body: validateOrganizationMembership('body')
 * - En rutas que requieren organizationId en params: validateOrganizationMembership('params')
 * - En rutas que requieren organizationId en query: validateOrganizationMembership('query')
 */
export function validateOrganizationMembership(source: 'body' | 'params' | 'query' = 'body') {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // En params la ruta usa :id, en body/query se llama organizationId
      const organizationId = source === 'params' 
        ? req.params.id 
        : req[source]?.organizationId;
      
      if (!organizationId) {
        return next(new HttpError(400, 'Organization ID is required'));
      }
      
      const organization = await Organization.findById(organizationId);
      
      if (!organization) {
        return next(new HttpError(404, 'Organization not found'));
      }
      
      if (!organization.active) {
        return next(new HttpError(403, 'Organization is inactive'));
      }
      
      // Verificar que el usuario es miembro de la organización
      const isMember = organization.members.some(
        (member: any) => member.toString() === req.user!.id
      );
      
      if (!isMember) {
        return next(new HttpError(403, 'You do not have access to this organization'));
      }
      
      // Agregar la organización al request para uso posterior
      req.organization = organization;
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware para validar que el usuario es el owner de la organización
 * Debe usarse después de validateOrganizationMembership
 */
export function validateOrganizationOwnership(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    if (!req.organization) {
      return next(new HttpError(500, 'Organization context not found. Use validateOrganizationMembership first'));
    }
    
    const isOwner = req.organization.owner.toString() === req.user!.id;
    
    if (!isOwner) {
      return next(new HttpError(403, 'Only the organization owner can perform this action'));
    }
    
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware para verificar que la organización no ha alcanzado límites
 */
export async function validateOrganizationLimits(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.organization) {
      return next(new HttpError(500, 'Organization context not found. Use validateOrganizationMembership first'));
    }
    
    const { settings } = req.organization;
    
    // Verificar límite de usuarios si se está agregando un miembro
    if (req.path.includes('/members') && req.method === 'POST') {
      if (settings.maxUsers && req.organization.members.length >= settings.maxUsers) {
        return next(new HttpError(400, `Organization has reached maximum user limit (${settings.maxUsers})`));
      }
    }
    
    next();
  } catch (err) {
    next(err);
  }
}

// Extender el tipo AuthRequest para incluir organization
declare module './auth.middleware' {
  interface AuthRequest {
    organization?: any;
  }
}
