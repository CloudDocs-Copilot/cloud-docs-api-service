import { Router } from 'express';
import authenticate from '../middlewares/auth.middleware';
import * as searchController from '../controllers/search.controller';

const router = Router();

/**
 * Todas las rutas requieren autenticación
 */
router.use(authenticate);

/**
 * @route   GET /api/search
 * @desc    Buscar documentos por nombre
 * @query   q - Término de búsqueda (requerido)
 * @query   organizationId - Filtrar por organización (opcional)
 * @query   mimeType - Filtrar por tipo de archivo (opcional)
 * @query   fromDate - Fecha inicial (opcional)
 * @query   toDate - Fecha final (opcional)
 * @query   limit - Número de resultados (opcional, default: 20)
 * @query   offset - Offset para paginación (opcional, default: 0)
 * @access  Authenticated users
 */
router.get('/', searchController.search);

/**
 * @route   GET /api/search/autocomplete
 * @desc    Obtener sugerencias de autocompletado
 * @query   q - Término de búsqueda (requerido)
 * @query   limit - Número de sugerencias (opcional, default: 5)
 * @access  Authenticated users
 */
router.get('/autocomplete', searchController.autocomplete);

export default router;
