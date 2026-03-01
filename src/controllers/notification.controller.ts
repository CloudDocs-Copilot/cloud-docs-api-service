import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as notificationService from '../services/notification.service';
import HttpError from '../models/error.model';

/**
 * GET /api/notifications
 * Query params:
 * - unread=true|false
 * - limit=20
 * - skip=0
 * - organizationId=... (optional)
 */
export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const unreadValue = req.query?.unread;
    const unreadStr = typeof unreadValue === 'string' ? unreadValue : 'false';
    const unreadOnly = unreadStr.toLowerCase() === 'true';
    
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
    
    const orgIdValue = req.query?.organizationId;
    const organizationId = typeof orgIdValue === 'string' ? orgIdValue : undefined;

    const result = await notificationService.listNotifications({
      userId: req.user!.id,
      unreadOnly,
      limit,
      skip,
      organizationId
    });

    res.json({
      success: true,
      count: result.notifications.length,
      total: result.total,
      notifications: result.notifications
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read
 */
export async function markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) return next(new HttpError(400, 'Notification ID is required'));

    await notificationService.markNotificationRead(req.user!.id, id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (err: unknown) {
    next(err);
  }
}

/**
 * POST /api/notifications/read-all
 */
export async function markAllRead(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : undefined;

    await notificationService.markAllRead(req.user!.id, organizationId);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (err: unknown) {
    next(err);
  }
}

export default { list, markRead, markAllRead };
