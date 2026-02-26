import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import HttpError from '../models/error.model';
import * as organizationService from '../services/organization.service';
import { SubscriptionPlan } from '../models/types/organization.types';

/**
 * Crea una nueva organización
 * POST /api/organizations
 */
export async function createOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = body.name;
    
    // Validar plan si se proporciona
    const planValue = body.plan;
    let plan: SubscriptionPlan | undefined = undefined;
    if (typeof planValue === 'string') {
      const validPlans = Object.values(SubscriptionPlan);
      if (validPlans.includes(planValue as SubscriptionPlan)) {
        plan = planValue as SubscriptionPlan;
      }
    }

    if (typeof name !== 'string' || !name) {
      return next(new HttpError(400, 'Organization name is required'));
    }

    const organization = await organizationService.createOrganization({
      name,
      ownerId: req.user!.id,
      plan: plan || SubscriptionPlan.FREE // Default to FREE plan
    });

    res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      organization
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Obtiene una organización por ID
 * GET /api/organizations/:id
 */
export async function getOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organization = await organizationService.getOrganizationById(String(req.params.id));

    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }

    // Verificar que el usuario pertenece a la organización
    // members está populated, así que accedemos a member._id o member.id
    const userIdStr = req.user!.id;
    const isMember = organization.members.some((member) => {
      if (typeof member === 'object' && member !== null && '_id' in member) {
        return String(member._id) === userIdStr;
      }
      return String(member) === userIdStr;
    });

    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }

    res.json({
      success: true,
      organization
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Lista las organizaciones del usuario autenticado
 * GET /api/organizations
 */
export async function listUserOrganizations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const memberships = await organizationService.getUserOrganizations(req.user!.id);

    res.json({
      success: true,
      count: memberships.length,
      memberships
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Actualiza una organización
 * PUT /api/organizations/:id
 */
export async function updateOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : undefined;
    
    // Validar settings si se proporciona
    const settingsValue = body.settings;
    let settings: organizationService.UpdateOrganizationDto['settings'] = undefined;
    
    if (typeof settingsValue === 'object' && settingsValue !== null && !Array.isArray(settingsValue)) {
      const validSettings: NonNullable<organizationService.UpdateOrganizationDto['settings']> = {};
      
      if ('maxStoragePerUser' in settingsValue && typeof settingsValue.maxStoragePerUser === 'number') {
        validSettings.maxStoragePerUser = settingsValue.maxStoragePerUser;
      }
      
      if ('allowedFileTypes' in settingsValue && Array.isArray(settingsValue.allowedFileTypes)) {
        const validTypes = settingsValue.allowedFileTypes.filter((t): t is string => typeof t === 'string');
        if (validTypes.length > 0) {
          validSettings.allowedFileTypes = validTypes;
        }
      }
      
      if ('maxUsers' in settingsValue && typeof settingsValue.maxUsers === 'number') {
        validSettings.maxUsers = settingsValue.maxUsers;
      }
      
      // Solo asignar settings si tiene al menos una propiedad válida
      if (Object.keys(validSettings).length > 0) {
        settings = validSettings;
      }
    }

    const organization = await organizationService.updateOrganization(
      String(req.params.id),
      req.user!.id,
      { name, settings }
    );

    res.json({
      success: true,
      message: 'Organization updated successfully',
      organization
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Elimina (desactiva) una organización
 * DELETE /api/organizations/:id
 */
export async function deleteOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await organizationService.deleteOrganization(String(req.params.id), req.user!.id);

    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Agrega un usuario a la organización
 * POST /api/organizations/:id/members
 */
export async function addMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const userId = body.userId;

    if (typeof userId !== 'string' || !userId) {
      return next(new HttpError(400, 'User ID is required'));
    }

    const organization = await organizationService.addUserToOrganization(
      String(req.params.id),
      userId
    );

    res.json({
      success: true,
      message: 'Member added successfully',
      organization
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Remueve un usuario de la organización
 * DELETE /api/organizations/:id/members/:userId
 */
export async function removeMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organization = await organizationService.removeUserFromOrganization(
      String(req.params.id),
      String(req.params.userId)
    );

    res.json({
      success: true,
      message: 'Member removed successfully',
      organization
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Obtiene estadísticas de almacenamiento de la organización
 * GET /api/organizations/:id/stats
 */
export async function getStorageStats(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Primero verificar que el usuario es member de la organización
    const organization = await organizationService.getOrganizationById(String(req.params.id));

    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }

    // Verificar membership (members está populated)
    const userIdStr = req.user!.id;
    const isMember = organization.members.some((member) => {
      if (typeof member === 'object' && member !== null && '_id' in member) {
        return String(member._id) === userIdStr;
      }
      return String(member) === userIdStr;
    });

    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }

    const stats = await organizationService.getOrganizationStorageStats(String(req.params.id));

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Obtiene los miembros de la organización
 * GET /api/organizations/:id/members
 */
export async function listMembers(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organization = await organizationService.getOrganizationById(String(req.params.id));

    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }

    // Verificar que el usuario pertenece a la organización
    // members está populated, así que accedemos a member._id o member.id
    const userIdStr = req.user!.id;
    const isMember = organization.members.some((member) => {
      if (typeof member === 'object' && member !== null && '_id' in member) {
        return String(member._id) === userIdStr;
      }
      return String(member) === userIdStr;
    });

    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }
    // Obtener members desde el membership service para asegurar formato consistente
    const { getOrganizationMembers } = await import('../services/membership.service');
    const members = await getOrganizationMembers(String(req.params.id));

    res.json({
      success: true,
      count: members.length,
      members
    });
  } catch (err) {
    next(err);
  }
}
