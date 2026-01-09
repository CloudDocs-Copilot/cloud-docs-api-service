import { Router } from 'express';
import authenticate from '../middlewares/auth.middleware';
import {
  validateOrganizationMembership,
  validateOrganizationOwnership,
  validateOrganizationLimits
} from '../middlewares/organization.middleware';
import * as organizationController from '../controllers/organization.controller';

const router = Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authenticate);

/**
 * @route   POST /api/organizations
 * @desc    Crea una nueva organización
 * @access  Authenticated users
 */
router.post('/', organizationController.createOrganization);

/**
 * @route   GET /api/organizations
 * @desc    Lista las organizaciones del usuario autenticado
 * @access  Authenticated users
 */
router.get('/', organizationController.listUserOrganizations);

/**
 * @route   GET /api/organizations/:id
 * @desc    Obtiene una organización por ID
 * @access  Organization members
 */
router.get('/:id', organizationController.getOrganization);

/**
 * @route   PUT /api/organizations/:id
 * @desc    Actualiza una organización
 * @access  Organization owner
 */
router.put(
  '/:id',
  validateOrganizationMembership('params'),
  validateOrganizationOwnership,
  organizationController.updateOrganization
);

/**
 * @route   DELETE /api/organizations/:id
 * @desc    Elimina (desactiva) una organización
 * @access  Organization owner
 */
router.delete(
  '/:id',
  validateOrganizationMembership('params'),
  validateOrganizationOwnership,
  organizationController.deleteOrganization
);

/**
 * @route   GET /api/organizations/:id/members
 * @desc    Lista los miembros de la organización
 * @access  Organization members
 */
router.get('/:id/members', organizationController.listMembers);

/**
 * @route   POST /api/organizations/:id/members
 * @desc    Agrega un usuario a la organización
 * @access  Organization owner
 */
router.post(
  '/:id/members',
  validateOrganizationMembership('params'),
  validateOrganizationOwnership,
  validateOrganizationLimits,
  organizationController.addMember
);

/**
 * @route   DELETE /api/organizations/:id/members/:userId
 * @desc    Remueve un usuario de la organización
 * @access  Organization owner
 */
router.delete(
  '/:id/members/:userId',
  validateOrganizationMembership('params'),
  validateOrganizationOwnership,
  organizationController.removeMember
);

/**
 * @route   GET /api/organizations/:id/stats
 * @desc    Obtiene estadísticas de almacenamiento
 * @access  Organization members
 */
router.get('/:id/stats', organizationController.getStorageStats);

export default router;
