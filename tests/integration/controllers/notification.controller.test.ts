import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../../src/middlewares/auth.middleware';

jest.resetModules();

jest.mock('../../../src/services/notification.service', () => ({
  __esModule: true,
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllRead: jest.fn()
}));

jest.mock('../../../src/models/error.model', () => {
  class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { __esModule: true, default: HttpError };
});

import * as notificationService from '../../../src/services/notification.service';
import HttpError from '../../../src/models/error.model';
import * as controller from '../../../src/controllers/notification.controller';

function makeRes(): Response {
  const res = {
    json: jest.fn().mockReturnThis()
  } as unknown as Response;
  return res;
}

describe('notification.controller (unit)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('list', (): void => {
    it('parses query params (defaults) and returns payload', async () => {
      const req = {
        user: { id: 'user1' },
        query: {} // unread default false, limit 20, skip 0, orgId undefined
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (notificationService.listNotifications as jest.Mock).mockResolvedValue({
        notifications: [{ id: 1 }],
        total: 10
      });

      await controller.list(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.listNotifications).toHaveBeenCalledWith({
        userId: 'user1',
        unreadOnly: false,
        limit: 20,
        skip: 0,
        organizationId: undefined
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        total: 10,
        notifications: [{ id: 1 }]
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('parses query params (unread=true, limit, skip, organizationId)', async () => {
      const req = {
        user: { id: 'user1' },
        query: { unread: 'TRUE', limit: '5', skip: '2', organizationId: 'org1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (notificationService.listNotifications as jest.Mock).mockResolvedValue({
        notifications: [],
        total: 0
      });

      await controller.list(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.listNotifications).toHaveBeenCalledWith({
        userId: 'user1',
        unreadOnly: true,
        limit: 5,
        skip: 2,
        organizationId: 'org1'
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        total: 0,
        notifications: []
      });
    });

    it('passes errors to next()', async () => {
      const req = {
        user: { id: 'user1' },
        query: {}
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (notificationService.listNotifications as jest.Mock).mockRejectedValue(boom);

      await controller.list(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('markRead', (): void => {
    it('returns 400 when id missing', async (): Promise<void> => {
      const req = {
        user: { id: 'user1' },
        params: {}
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      await controller.markRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.markNotificationRead).not.toHaveBeenCalled();

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(400);
      expect((err as Error).message).toBe('Notification ID is required');
    });

    it('marks notification as read', async (): Promise<void> => {
      const req = {
        user: { id: 'user1' },
        params: { id: 'n1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (notificationService.markNotificationRead as jest.Mock).mockResolvedValue(undefined);

      await controller.markRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.markNotificationRead).toHaveBeenCalledWith('user1', 'n1');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification marked as read'
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req = {
        user: { id: 'user1' },
        params: { id: 'n1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (notificationService.markNotificationRead as jest.Mock).mockRejectedValue(boom);

      await controller.markRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('markAllRead', (): void => {
    it('uses organizationId from body if provided', async (): Promise<void> => {
      const req = {
        user: { id: 'user1' },
        body: { organizationId: 'org1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (notificationService.markAllRead as jest.Mock).mockResolvedValue(undefined);

      await controller.markAllRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.markAllRead).toHaveBeenCalledWith('user1', 'org1');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All notifications marked as read'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('passes undefined organizationId when body missing', async (): Promise<void> => {
      const req = {
        user: { id: 'user1' },
        body: undefined
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (notificationService.markAllRead as jest.Mock).mockResolvedValue(undefined);

      await controller.markAllRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(notificationService.markAllRead).toHaveBeenCalledWith('user1', undefined);
      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req = {
        user: { id: 'user1' },
        body: {}
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (notificationService.markAllRead as jest.Mock).mockRejectedValue(boom);

      await controller.markAllRead(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
