import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import HttpError from '../models/error.model';
import * as commentService from '../services/comment.service';

export async function create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { documentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return next(new HttpError(400, 'Contenido es requerido'));
    }

    const comment = await commentService.createComment({
      documentId,
      userId: req.user!.id,
      content
    });

    res.status(201).json({
      success: true,
      message: 'Comentario creado exitosamente',
      comment
    });
  } catch (err) {
    next(err);
  }
}

export async function listByDocument(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;
    if (!documentId) return next(new HttpError(400, 'documentId es requerido'));

    const comments = await commentService.listComments({
      documentId,
      userId: req.user!.id
    });

    res.json({
      success: true,
      count: comments.length,
      comments
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return next(new HttpError(400, 'Contenido es requerido'));
    }

    const comment = await commentService.updateComment({
      commentId: id,
      userId: req.user!.id,
      content
    });

    res.json({
      success: true,
      message: 'Comentario actualizado exitosamente',
      comment
    });
  } catch (err) {
    next(err);
  }
}

export default {
  create,
  listByDocument,
  update
};
