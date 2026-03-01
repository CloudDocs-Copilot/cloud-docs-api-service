import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as searchService from '../services/search.service';
import { getActiveOrganization } from '../services/membership.service';
import HttpError from '../models/error.model';

/**
 * Controlador para buscar documentos
 */
export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, organizationId, mimeType, category, fromDate, toDate, limit, offset } = req.query;

    if (!q || typeof q !== 'string') {
      return next(new HttpError(400, 'Query parameter "q" is required'));
    }

    console.log(`🔍 [Search Controller] Parámetros recibidos:`, {
      query: q,
      organizationId,
      mimeType,
      fromDate,
      toDate,
      limit,
      offset
    });

    // Si no se pasa organizationId, intentar usar la organización activa del usuario
    let effectiveOrganizationId: string | undefined = organizationId as string | undefined;
    if (!effectiveOrganizationId) {
      try {
        const active = await getActiveOrganization(req.user!.id);
        if (active) effectiveOrganizationId = active;
      } catch (err) {
        // No bloquear la búsqueda por fallo al obtener la org activa
        console.warn('Could not resolve active organization for user', err);
      }
    }

    const searchParams: searchService.SearchParams = {
      query: q,
      userId: req.user!.id,
      organizationId: effectiveOrganizationId,
      mimeType: mimeType as string | undefined,
      category: category as string | undefined,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0
    };

    const results = await searchService.searchDocuments(searchParams);

    res.json({
      success: true,
      data: results.documents,
      total: results.total,
      took: results.took,
      limit: searchParams.limit,
      offset: searchParams.offset
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error searching documents';
    console.error('Error in search controller:', err);
    next(new HttpError(500, msg));
  }
}

/**
 * Controlador para obtener sugerencias de autocompletado
 */
export async function autocomplete(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { q, limit, organizationId } = req.query;

    if (!q || typeof q !== 'string') {
      return next(new HttpError(400, 'Query parameter "q" is required'));
    }

    const suggestions = await searchService.getAutocompleteSuggestions(
      q,
      req.user!.id,
      organizationId as string | undefined,
      limit ? parseInt(limit as string, 10) : 5
    );

    res.json({
      success: true,
      suggestions
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error getting autocomplete suggestions';
    console.error('Error in autocomplete controller:', err);
    next(new HttpError(500, msg));
  }
}

export default {
  search,
  autocomplete
};
