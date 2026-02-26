import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as membershipService from '../services/membership.service';
import HttpError from '../models/error.model';
import { MembershipRole } from '../models/membership.model';

/**
 * Obtiene todas las organizaciones del usuario autenticado
 * GET /api/memberships/my-organizations
 */
export async function getMyOrganizations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const memberships = await membershipService.getUserMemberships(req.user!.id);

    res.json({
      success: true,
      count: memberships.length,
      data: memberships
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Obtiene los miembros de una organización
 * GET /api/memberships/:organizationId/members
 */
export async function getOrganizationMembers(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId } = req.params;

    const members = await membershipService.getOrganizationMembers(String(organizationId));

    res.json({
      success: true,
      count: members.length,
      data: members
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Cambia la organización activa del usuario
 * POST /api/memberships/switch/:organizationId
 */
export async function switchOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId } = req.params;

    await membershipService.switchActiveOrganization(req.user!.id, String(organizationId));

    res.json({
      success: true,
      message: 'Active organization switched successfully',
      organizationId
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Abandona una organización
 * DELETE /api/memberships/:organizationId/leave
 */
export async function leaveOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId } = req.params;

    await membershipService.removeMembership(req.user!.id, String(organizationId));

    res.json({
      success: true,
      message: 'You have left the organization successfully'
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Obtiene la organización activa del usuario
 * GET /api/memberships/active-organization
 */
export async function getActiveOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const activeOrgId = await membershipService.getActiveOrganization(req.user!.id);

    if (!activeOrgId) {
      return next(new HttpError(404, 'No active organization found'));
    }

    res.json({
      success: true,
      organizationId: activeOrgId
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Establece la organización activa del usuario
 * POST /api/memberships/set-active
 * Body: { organizationId: string }
 */
export async function setActiveOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const organizationId = body.organizationId;

    if (typeof organizationId !== 'string' || !organizationId) {
      return next(new HttpError(400, 'organizationId is required'));
    }

    await membershipService.switchActiveOrganization(req.user!.id, organizationId);

    res.json({
      success: true,
      message: 'Active organization updated successfully',
      activeOrganization: organizationId
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Invita un usuario a la organización
 * POST /api/memberships/organization/:organizationId/members
 * Body: { userId: string, role?: 'viewer' | 'member' | 'admin' }
 */
export async function inviteUserToOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId } = req.params;
    const body = req.body as Record<string, unknown>;
    const userId = body.userId;
    const roleValue = body.role;

    if (typeof userId !== 'string' || !userId) {
      return next(new HttpError(400, 'userId is required'));
    }

    // Ensure userId is a string and looks like a MongoDB ObjectId to avoid NoSQL injection
    if (!/^[a-fA-F0-9]{24}$/.test(userId)) {
      return next(new HttpError(400, 'Invalid userId format'));
    }

    // Validate role against MembershipRole enum
    let role: MembershipRole = MembershipRole.MEMBER; // Default role
    if (typeof roleValue === 'string') {
      const validRoles = Object.values(MembershipRole);
      if (validRoles.includes(roleValue as MembershipRole)) {
        role = roleValue as MembershipRole;
      } else {
        return next(new HttpError(400, 'Invalid role. Valid roles: owner, admin, member, viewer'));
      }
    }

    const invitation = await membershipService.createInvitation({
      userId,
      organizationId: String(organizationId),
      role,
      invitedBy: req.user!.id
    });

    res.status(201).json({
      success: true,
      message: 'Invitation sent successfully',
      invitation
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * Actualiza el rol de un miembro
 * PATCH /api/memberships/organization/:organizationId/members/:membershipId
 * Body: { role: 'viewer' | 'member' | 'admin' }
 */
export async function updateMemberRole(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { membershipId } = req.params;
    const body = req.body as Record<string, unknown>;
    const roleValue = body.role;

    if (typeof roleValue !== 'string' || !roleValue) {
      return next(new HttpError(400, 'role is required'));
    }

    // Validate role against MembershipRole enum
    const validRoles = Object.values(MembershipRole);
    if (!validRoles.includes(roleValue as MembershipRole)) {
      return next(new HttpError(400, 'Invalid role. Valid roles: owner, admin, member, viewer'));
    }
    const role = roleValue as MembershipRole;

    const membership = await membershipService.updateMembershipRole(
      String(membershipId),
      role,
      req.user!.id
    );

    res.json({
      success: true,
      membership
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Elimina un miembro de la organización
 * DELETE /api/memberships/organization/:organizationId/members/:membershipId
 */
export async function removeMember(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { organizationId, membershipId } = req.params;

    await membershipService.removeMembershipById(
      String(membershipId),
      String(organizationId),
      req.user!.id
    );

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Obtiene las invitaciones pendientes del usuario autenticado
 * GET /api/memberships/pending-invitations
 */
export async function getPendingInvitations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invitations = await membershipService.getPendingInvitations(req.user!.id);

    res.json({
      success: true,
      count: invitations.length,
      data: invitations
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Acepta una invitación pendiente
 * POST /api/memberships/invitations/:membershipId/accept
 */
export async function acceptInvitation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { membershipId } = req.params;

    const membership = await membershipService.acceptInvitation(String(membershipId), req.user!.id);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      membership
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Rechaza una invitación pendiente
 * POST /api/memberships/invitations/:membershipId/reject
 */
export async function rejectInvitation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { membershipId } = req.params;

    await membershipService.rejectInvitation(String(membershipId), req.user!.id);

    res.json({
      success: true,
      message: 'Invitation rejected successfully'
    });
  } catch (err) {
    next(err);
  }
}

export default {
  getMyOrganizations,
  getOrganizationMembers,
  switchOrganization,
  leaveOrganization,
  getActiveOrganization,
  setActiveOrganization,
  inviteUserToOrganization,
  updateMemberRole,
  removeMember,
  getPendingInvitations,
  acceptInvitation,
  rejectInvitation
};
