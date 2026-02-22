import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as searchService from '../services/search.service';
import HttpError from '../models/error.model';

/**
 * Controlador para buscar documentos
 */
export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, organizationId, mimeType, fromDate, toDate, limit, offset } = req.query;

    if (!q || typeof q !== 'string') {
      return next(new HttpError(400, 'Query parameter "q" is required'));
    }

    const searchParams: searchService.SearchParams = {
      query: q,
      userId: req.user!.id,
      organizationId: organizationId as string | undefined,
      mimeType: mimeType as string | undefined,
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
  } catch (err: any) {
    console.error('Error in search controller:', err);
    next(new HttpError(500, 'Error searching documents'));
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
    const { q, limit } = req.query;

    if (!q || typeof q !== 'string') {
      return next(new HttpError(400, 'Query parameter "q" is required'));
    }

    const suggestions = await searchService.getAutocompleteSuggestions(
      q,
      req.user!.id,
      limit ? parseInt(limit as string, 10) : 5
    );

    res.json({
      success: true,
      suggestions
    });
  } catch (err: any) {
    console.error('Error in autocomplete controller:', err);
    next(new HttpError(500, 'Error getting autocomplete suggestions'));
  }
}

export default {
  search,
  autocomplete
};
