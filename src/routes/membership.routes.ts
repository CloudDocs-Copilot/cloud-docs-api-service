import { Router } from 'express';
import * as membershipController from '../controllers/membership.controller';
import authenticate from '../middlewares/auth.middleware';
import { validateOrganizationMembership } from '../middlewares/organization.middleware';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * GET /api/memberships/pending-invitations
 * Obtiene las invitaciones pendientes del usuario autenticado
 */
router.get('/pending-invitations', membershipController.getPendingInvitations);

/**
 * POST /api/memberships/invitations/:membershipId/accept
 * Acepta una invitación pendiente
 */
router.post('/invitations/:membershipId/accept', membershipController.acceptInvitation);

/**
 * POST /api/memberships/invitations/:membershipId/reject
 * Rechaza una invitación pendiente
 */
router.post('/invitations/:membershipId/reject', membershipController.rejectInvitation);

/**
 * GET /api/memberships/my-organizations
 * Obtiene todas las organizaciones del usuario
 */
router.get('/my-organizations', membershipController.getMyOrganizations);

/**
 * GET /api/memberships/active-organization
 * Obtiene la organización activa del usuario
 */
router.get('/active-organization', membershipController.getActiveOrganization);

/**
 * GET /api/memberships/:organizationId/members
 * Obtiene los miembros de una organización (requiere ser miembro)
 */
router.get(
  '/organization/:organizationId/members',
  validateOrganizationMembership('params'),
  membershipController.getOrganizationMembers
);

/**
 * POST /api/memberships/organization/:organizationId/members
 * Invita un usuario a la organización (requiere rol admin/owner)
 */
router.post(
  '/organization/:organizationId/members',
  validateOrganizationMembership('params'),
  membershipController.inviteUserToOrganization
);

/**
 * POST /api/memberships/set-active
 * Cambia la organización activa (requiere ser miembro)
 */
router.post('/set-active', membershipController.setActiveOrganization);

/**
 * PATCH /api/memberships/organization/:organizationId/members/:membershipId
 * Actualiza el rol de un miembro (requiere rol owner)
 */
router.patch(
  '/organization/:organizationId/members/:membershipId',
  validateOrganizationMembership('params'),
  membershipController.updateMemberRole
);

/**
 * DELETE /api/memberships/organization/:organizationId/members/:membershipId
 * Elimina un miembro de la organización (requiere rol admin/owner)
 */
router.delete(
  '/organization/:organizationId/members/:membershipId',
  validateOrganizationMembership('params'),
  membershipController.removeMember
);

/**
 * POST /api/memberships/switch/:organizationId
 * DEPRECATED - Usar /set-active en su lugar
 * Cambia la organización activa (requiere ser miembro)
 */
router.post(
  '/switch/:organizationId',
  validateOrganizationMembership('params'),
  membershipController.switchOrganization
);

/**
 * DELETE /api/memberships/:organizationId/leave
 * Abandona una organización (no puede ser owner)
 */
router.delete(
  '/:organizationId/leave',
  validateOrganizationMembership('params'),
  membershipController.leaveOrganization
);

export default router;
