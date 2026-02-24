import express from 'express';
import * as deletionController from '../controllers/deletion.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireActiveOrganization } from '../middlewares/organization.middleware';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// GET /api/deletion/trash - Obtener documentos en la papelera de la organización
router.get('/trash', requireActiveOrganization, deletionController.getTrash);

// DELETE /api/deletion/trash - Vaciar toda la papelera de la organización
router.delete('/trash', requireActiveOrganization, deletionController.emptyTrash);

/**
 * Operaciones sobre documentos individuales
 * ESTAS DEBEN IR AL FINAL porque tienen parámetros dinámicos (:id)
 */

// POST /api/deletion/:id/trash - Mover documento a papelera (soft delete)
router.post(
  '/:id/trash',
  (req, _res, next) => {
    console.log('🗑️ POST /:id/trash endpoint hit! ID:', req.params.id);
    next();
  },
  deletionController.moveToTrash
);

// POST /api/deletion/:id/restore - Restaurar documento de la papelera
router.post('/:id/restore', deletionController.restoreFromTrash);

// DELETE /api/deletion/:id/permanent - Eliminación permanente con sobrescritura segura
router.delete('/:id/permanent', deletionController.permanentDelete);

// GET /api/deletion/:id/history - Historial de eliminaciones de un documento
router.get('/:id/history', deletionController.getDocumentDeletionHistory);

export default router;
