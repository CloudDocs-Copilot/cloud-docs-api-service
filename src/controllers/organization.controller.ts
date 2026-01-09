import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import HttpError from '../models/error.model';
import * as organizationService from '../services/organization.service';

/**
 * Crea una nueva organización
 * POST /api/organizations
 */
export async function createOrganization(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, settings } = req.body;
    
    if (!name) {
      return next(new HttpError(400, 'Organization name is required'));
    }
    
    const organization = await organizationService.createOrganization({
      name,
      ownerId: req.user!.id,
      settings
    });
    
    res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      organization
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Obtiene una organización por ID
 * GET /api/organizations/:id
 */
export async function getOrganization(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organization = await organizationService.getOrganizationById(req.params.id);
    
    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }
    
    // Verificar que el usuario pertenece a la organización
    // members está populated, así que accedemos a member._id o member.id
    const isMember = organization.members.some(
      (member: any) => (member._id || member).toString() === req.user!.id
    );
    
    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }
    
    res.json({
      success: true,
      organization
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lista las organizaciones del usuario autenticado
 * GET /api/organizations
 */
export async function listUserOrganizations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizations = await organizationService.getUserOrganizations(req.user!.id);
    
    res.json({
      success: true,
      count: organizations.length,
      organizations
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Actualiza una organización
 * PUT /api/organizations/:id
 */
export async function updateOrganization(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, settings } = req.body;
    
    const organization = await organizationService.updateOrganization(
      req.params.id,
      req.user!.id,
      { name, settings }
    );
    
    res.json({
      success: true,
      message: 'Organization updated successfully',
      organization
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Elimina (desactiva) una organización
 * DELETE /api/organizations/:id
 */
export async function deleteOrganization(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await organizationService.deleteOrganization(
      req.params.id,
      req.user!.id
    );
    
    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Agrega un usuario a la organización
 * POST /api/organizations/:id/members
 */
export async function addMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return next(new HttpError(400, 'User ID is required'));
    }
    
    const organization = await organizationService.addUserToOrganization(
      req.params.id,
      userId
    );
    
    res.json({
      success: true,
      message: 'Member added successfully',
      organization
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Remueve un usuario de la organización
 * DELETE /api/organizations/:id/members/:userId
 */
export async function removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organization = await organizationService.removeUserFromOrganization(
      req.params.id,
      req.params.userId
    );
    
    res.json({
      success: true,
      message: 'Member removed successfully',
      organization
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Obtiene estadísticas de almacenamiento de la organización
 * GET /api/organizations/:id/stats
 */
export async function getStorageStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Primero verificar que el usuario es member de la organización
    const organization = await organizationService.getOrganizationById(req.params.id);
    
    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }
    
    // Verificar membership (members está populated)
    const isMember = organization.members.some(
      (member: any) => (member._id || member).toString() === req.user!.id
    );
    
    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }
    
    const stats = await organizationService.getOrganizationStorageStats(req.params.id);
    
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
export async function listMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const organization = await organizationService.getOrganizationById(req.params.id);
    
    if (!organization) {
      return next(new HttpError(404, 'Organization not found'));
    }
    
    // Verificar que el usuario pertenece a la organización
    // members está populated, así que accedemos a member._id o member.id
    const isMember = organization.members.some(
      (member: any) => (member._id || member).toString() === req.user!.id
    );
    
    if (!isMember) {
      return next(new HttpError(403, 'Access denied to this organization'));
    }
    
    res.json({
      success: true,
      count: organization.members.length,
      members: organization.members
    });
  } catch (err) {
    next(err);
  }
}
