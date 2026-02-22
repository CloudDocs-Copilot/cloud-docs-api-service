import type { NextFunction } from 'express';

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

const notificationService = require('../../../src/services/notification.service');
const HttpError = require('../../../src/models/error.model').default;
const controller = require('../../../src/controllers/notification.controller');

function makeRes() {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('notification.controller (unit)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('parses query params (defaults) and returns payload', async () => {
      const req: any = {
        user: { id: 'user1' },
        query: {} // unread default false, limit 20, skip 0, orgId undefined
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      notificationService.listNotifications.mockResolvedValue({
        notifications: [{ id: 1 }],
        total: 10
      });

      await controller.list(req, res, next);

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
      const req: any = {
        user: { id: 'user1' },
        query: { unread: 'TRUE', limit: '5', skip: '2', organizationId: 'org1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      notificationService.listNotifications.mockResolvedValue({
        notifications: [],
        total: 0
      });

      await controller.list(req, res, next);

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
      const req: any = {
        user: { id: 'user1' },
        query: {}
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      notificationService.listNotifications.mockRejectedValue(boom);

      await controller.list(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('markRead', () => {
    it('returns 400 when id missing', async () => {
      const req: any = {
        user: { id: 'user1' },
        params: {}
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await controller.markRead(req, res, next);

      expect(notificationService.markNotificationRead).not.toHaveBeenCalled();

      const err = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Notification ID is required');
    });

    it('marks notification as read', async () => {
      const req: any = {
        user: { id: 'user1' },
        params: { id: 'n1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      notificationService.markNotificationRead.mockResolvedValue(undefined);

      await controller.markRead(req, res, next);

      expect(notificationService.markNotificationRead).toHaveBeenCalledWith('user1', 'n1');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification marked as read'
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req: any = {
        user: { id: 'user1' },
        params: { id: 'n1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      notificationService.markNotificationRead.mockRejectedValue(boom);

      await controller.markRead(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('markAllRead', () => {
    it('uses organizationId from body if provided', async () => {
      const req: any = {
        user: { id: 'user1' },
        body: { organizationId: 'org1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      notificationService.markAllRead.mockResolvedValue(undefined);

      await controller.markAllRead(req, res, next);

      expect(notificationService.markAllRead).toHaveBeenCalledWith('user1', 'org1');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All notifications marked as read'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('passes undefined organizationId when body missing', async () => {
      const req: any = {
        user: { id: 'user1' },
        body: undefined
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      notificationService.markAllRead.mockResolvedValue(undefined);

      await controller.markAllRead(req, res, next);

      expect(notificationService.markAllRead).toHaveBeenCalledWith('user1', undefined);
      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req: any = {
        user: { id: 'user1' },
        body: {}
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      notificationService.markAllRead.mockRejectedValue(boom);

      await controller.markAllRead(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
