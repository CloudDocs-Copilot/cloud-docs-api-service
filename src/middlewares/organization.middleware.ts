import { Response, NextFunction } from 'express';
import type { Types } from 'mongoose';
import { AuthRequest } from './auth.middleware';
import HttpError from '../models/error.model';
import Organization from '../models/organization.model';
import type { IOrganization } from '../models/types/organization.types';
import {
  hasActiveMembership,
  getActiveOrganization,
  getMembership
} from '../services/membership.service';
import { MembershipRole } from '../models/membership.model';

/**
 * Middleware para validar que el usuario pertenece a la organización especificada
 * Valida membresía activa usando el servicio de Membership
 *
 * Uso:
 * - En rutas que requieren organizationId en body: validateOrganizationMembership('body')
 * - En rutas que requieren organizationId en params: validateOrganizationMembership('params')
 * - En rutas que requieren organizationId en query: validateOrganizationMembership('query')
 */
export function validateOrganizationMembership(source: 'body' | 'params' | 'query' = 'body') {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      let organizationId: string | undefined;

      if (source === 'params') {
        const organizationIdParam = req.params.organizationId;
        const idParam = req.params.id;
        organizationId = organizationIdParam ?? idParam;
      } else if (source === 'body') {
        const body = req.body as Record<string, unknown>;
        const value = body.organizationId;
        if (typeof value === 'string') {
          organizationId = value;
        }
      } else {
        const query = req.query as Record<string, unknown>;
        const value = query.organizationId;
        if (typeof value === 'string') {
          organizationId = value;
        }
      }

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

      // Validar membresía activa usando el servicio de Membership
      const isActiveMember = await hasActiveMembership(req.user!.id, organizationId);

      if (!isActiveMember) {
        return next(new HttpError(403, 'Access denied: You are not a member of this organization'));
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
 * Usa Membership para verificar el rol
 * Debe usarse después de validateOrganizationMembership
 */
export async function validateOrganizationOwnership(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.organization) {
      return next(
        new HttpError(
          500,
          'Organization context not found. Use validateOrganizationMembership first'
        )
      );
    }

    // Verificar usando Membership
    const membership = await getMembership(req.user!.id, req.organization._id.toString());

    if (!membership || membership.role !== MembershipRole.OWNER) {
      return next(new HttpError(403, 'Only the organization owner can perform this action'));
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware para verificar que la organización no ha alcanzado límites del plan
 * Usa Membership para contar usuarios activos
 */
export async function validateOrganizationLimits(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.organization) {
      return next(
        new HttpError(
          500,
          'Organization context not found. Use validateOrganizationMembership first'
        )
      );
    }

    const { settings } = req.organization;

    // Verificar límite de usuarios si se está agregando un miembro
    if (req.path.includes('/members') && req.method === 'POST') {
      // Importar Membership para contar usuarios activos
      const Membership = (await import('../models/membership.model')).default;
      const activeMembersCount = await Membership.countDocuments({
        organization: req.organization._id,
        status: 'active'
      });

      if (settings.maxUsers !== -1 && activeMembersCount >= settings.maxUsers) {
        return next(
          new HttpError(
            400,
            `Organization has reached maximum user limit (${settings.maxUsers}) for ${req.organization.plan} plan`
          )
        );
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware para validar que el usuario tiene una organización activa
 * Usado en endpoints que requieren contexto de organización pero no reciben organizationId
 */
export async function requireActiveOrganization(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, 'Authentication required'));
    }

    // Obtener organización activa del usuario
    const activeOrgId = await getActiveOrganization(user.id);

    if (!activeOrgId) {
      return next(
        new HttpError(403, 'No active organization. Please create or join an organization first.')
      );
    }

    // Cargar organización y adjuntarla al request
    const organization = await Organization.findById(activeOrgId);
    if (!organization || !organization.active) {
      return next(new HttpError(403, 'Organization is not active'));
    }

    req.organization = organization;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware para validar roles mínimos requeridos
 * Uso: validateMinimumRole(MembershipRole.ADMIN)
 */
export function validateMinimumRole(minimumRole: MembershipRole) {
  const roleHierarchy = {
    [MembershipRole.VIEWER]: 0,
    [MembershipRole.MEMBER]: 1,
    [MembershipRole.ADMIN]: 2,
    [MembershipRole.OWNER]: 3
  };

  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.organization) {
        return next(
          new HttpError(
            500,
            'Organization context not found. Use validateOrganizationMembership first'
          )
        );
      }

      const membership = await getMembership(req.user!.id, req.organization._id.toString());

      if (!membership) {
        return next(new HttpError(403, 'You are not a member of this organization'));
      }

      const userRoleLevel = roleHierarchy[membership.role];
      const requiredRoleLevel = roleHierarchy[minimumRole];

      if (userRoleLevel < requiredRoleLevel) {
        return next(new HttpError(403, `This action requires ${minimumRole} role or higher`));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// Extender el tipo AuthRequest para incluir organization
declare module './auth.middleware' {
  interface AuthRequest {
    organization?: IOrganization;
    activeOrganization?: Types.ObjectId | string;
  }
}
