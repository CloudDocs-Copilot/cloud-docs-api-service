import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../../src/middlewares/auth.middleware';

/* eslint-disable @typescript-eslint/unbound-method */

jest.resetModules();

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

jest.mock('../../../src/services/comment.service', () => ({
  __esModule: true,
  createComment: jest.fn(),
  listComments: jest.fn(),
  updateComment: jest.fn()
}));

import HttpError from '../../../src/models/error.model';
import * as commentService from '../../../src/services/comment.service';
import * as commentController from '../../../src/controllers/comment.controller';

function makeRes(): Response {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res)
  } as unknown as Response;
  return res;
}

describe('comment.controller (unit)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('create', (): void => {
    it('returns 400 when content missing', async (): Promise<void> => {
        const req = {
            params: { documentId: 'doc1' },
            body: {},
            user: { id: 'user1' }
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      await commentController.create(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.createComment).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(400);
      expect((err as Error).message).toBe('Contenido es requerido');
    });

    it('creates comment and returns 201', async (): Promise<void> => {
        const req = {
            params: { documentId: 'doc1' },
            body: { content: 'hola' },
            user: { id: 'user1' }
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (commentService.createComment as jest.Mock).mockResolvedValue({ id: 'c1' });

      await commentController.create(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.createComment).toHaveBeenCalledWith({
        documentId: 'doc1',
        userId: 'user1',
        content: 'hola'
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comentario creado exitosamente',
        comment: { id: 'c1' }
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req = {
        params: { documentId: 'doc1' },
        body: { content: 'hola' },
        user: { id: 'user1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (commentService.createComment as jest.Mock).mockRejectedValue(boom);

      await commentController.create(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('listByDocument', (): void => {
    it('returns 400 when documentId missing', async (): Promise<void> => {
        const req = {
            params: {},
            body: {},
            user: { id: 'user1' }
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      await commentController.listByDocument(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.listComments).not.toHaveBeenCalled();

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(400);
      expect((err as Error).message).toBe('documentId es requerido');
    });

    it('lists comments and returns count', async (): Promise<void> => {
        const req = {
            params: { documentId: 'doc1' },
            user: { id: 'user1' },
            query: {}
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (commentService.listComments as jest.Mock).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      await commentController.listByDocument(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.listComments).toHaveBeenCalledWith({
        documentId: 'doc1',
        userId: 'user1'
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        comments: [{ id: 'c1' }, { id: 'c2' }]
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req = { params: { documentId: 'doc1' }, user: { id: 'user1' } } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (commentService.listComments as jest.Mock).mockRejectedValue(boom);

      await commentController.listByDocument(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('update', (): void => {
    it('returns 400 when content missing', async (): Promise<void> => {
        const req = {
            params: { id: 'c1' },
            body: {},
            user: { id: 'user1' }
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      await commentController.update(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.updateComment).not.toHaveBeenCalled();

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(400);
      expect((err as Error).message).toBe('Contenido es requerido');
    });

    it('updates comment and returns success', async (): Promise<void> => {
        const req = {
            params: { id: 'c1' },
            body: { content: 'nuevo' },
            user: { id: 'user1' }
          } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      (commentService.updateComment as jest.Mock).mockResolvedValue({ id: 'c1', content: 'nuevo' });

      await commentController.update(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(commentService.updateComment).toHaveBeenCalledWith({
        commentId: 'c1',
        userId: 'user1',
        content: 'nuevo'
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Comentario actualizado exitosamente',
        comment: { id: 'c1', content: 'nuevo' }
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next()', async () => {
      const req = {
        params: { id: 'c1' },
        body: { content: 'nuevo' },
        user: { id: 'user1' }
      } as unknown as AuthRequest;
      const res = makeRes();
      const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;

      const boom = new Error('boom');
      (commentService.updateComment as jest.Mock).mockRejectedValue(boom);

      await commentController.update(req as unknown as AuthRequest, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
