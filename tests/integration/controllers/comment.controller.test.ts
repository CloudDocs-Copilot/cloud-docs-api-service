import type { NextFunction } from 'express';

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

const HttpError = require('../../../src/models/error.model').default;
const commentService = require('../../../src/services/comment.service');
const commentController = require('../../../src/controllers/comment.controller');

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('comment.controller (unit)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('returns 400 when content missing', async () => {
      const req: any = {
        params: { documentId: 'doc1' },
        body: {},
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await commentController.create(req, res, next);

      expect(commentService.createComment).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Contenido es requerido');
    });

    it('creates comment and returns 201', async () => {
      const req: any = {
        params: { documentId: 'doc1' },
        body: { content: 'hola' },
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      commentService.createComment.mockResolvedValue({ id: 'c1' });

      await commentController.create(req, res, next);

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
      const req: any = {
        params: { documentId: 'doc1' },
        body: { content: 'hola' },
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      commentService.createComment.mockRejectedValue(boom);

      await commentController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('listByDocument', () => {
    it('returns 400 when documentId missing', async () => {
      const req: any = {
        params: {},
        body: {},
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await commentController.listByDocument(req, res, next);

      expect(commentService.listComments).not.toHaveBeenCalled();

      const err = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('documentId es requerido');
    });

    it('lists comments and returns count', async () => {
      const req: any = {
        params: { documentId: 'doc1' },
        user: { id: 'user1' },
        query: {}
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      commentService.listComments.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      await commentController.listByDocument(req, res, next);

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
      const req: any = {
        params: { documentId: 'doc1' },
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      commentService.listComments.mockRejectedValue(boom);

      await commentController.listByDocument(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });

  describe('update', () => {
    it('returns 400 when content missing', async () => {
      const req: any = {
        params: { id: 'c1' },
        body: {},
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      await commentController.update(req, res, next);

      expect(commentService.updateComment).not.toHaveBeenCalled();

      const err = (next as any).mock.calls[0][0];
      expect(err).toBeInstanceOf(HttpError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Contenido es requerido');
    });

    it('updates comment and returns success', async () => {
      const req: any = {
        params: { id: 'c1' },
        body: { content: 'nuevo' },
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      commentService.updateComment.mockResolvedValue({ id: 'c1', content: 'nuevo' });

      await commentController.update(req, res, next);

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
      const req: any = {
        params: { id: 'c1' },
        body: { content: 'nuevo' },
        user: { id: 'user1' }
      };
      const res = makeRes();
      const next = jest.fn() as NextFunction;

      const boom = new Error('boom');
      commentService.updateComment.mockRejectedValue(boom);

      await commentController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
