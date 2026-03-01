import errorHandler from '../../../src/middlewares/error.middleware';
import HttpError from '../../../src/models/error.model';

function makeRes(): Partial<import('express').Response> {
  const res: Partial<import('express').Response> = {};
  res.status = jest.fn(() => res as import('express').Response);
  res.json = jest.fn(() => res as import('express').Response);
  return res;
}

describe('error.middleware', (): void => {
  test('handles HttpError', (): void => {
    const res = makeRes();
    const err = new HttpError(418, 'teapot');
    errorHandler(err, {} as unknown as import('express').Request, res as import('express').Response, jest.fn() as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'teapot' });
  });

  test('maps Mongoose ValidationError', (): void => {
    const res = makeRes();
    const err = { name: 'ValidationError', message: 'v' };
    errorHandler(err as unknown, {} as unknown as import('express').Request, res as import('express').Response, jest.fn() as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('maps CastError', (): void => {
    const res = makeRes();
    const err = { name: 'CastError', message: 'c' };
    errorHandler(err as unknown, {} as unknown as import('express').Request, res as import('express').Response, jest.fn() as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('maps duplicate key error', (): void => {
    const res = makeRes();
    const err = { code: 11000, keyValue: { name: 'x' } };
    const next = jest.fn();
    errorHandler(err as unknown, {} as unknown as import('express').Request, res as import('express').Response, next as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('handles TokenExpiredError', (): void => {
    const res = makeRes();
    const err = { name: 'TokenExpiredError', message: 't' };
    errorHandler(err as unknown, {} as unknown as import('express').Request, res as import('express').Response, jest.fn() as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('fallback to 500', (): void => {
    const res = makeRes();
    const err = new Error('unknown');
    errorHandler(err, {} as unknown as import('express').Request, res as import('express').Response, jest.fn() as unknown as import('express').NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
// Unit tests for error.middleware.ts (improve branch coverage)
import { Request, Response, NextFunction } from 'express';


describe('error.middleware', (): void => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock
    };
    mockNext = jest.fn();
    process.env.NODE_ENV = 'test'; // suppress console.error
  });

  describe('HttpError', (): void => {
    it('should handle HttpError with custom status and message', (): void => {
      const err = new HttpError(404, 'Resource not found');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found'
      });
    });

    it('should handle HttpError with 403', (): void => {
      const err = new HttpError(403, 'Forbidden');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden'
      });
    });
  });

  describe('Mongoose Errors', (): void => {
    it('should handle ValidationError', (): void => {
      const err = { name: 'ValidationError', message: 'Validation failed' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed'
      });
    });

    it('should handle CastError', (): void => {
      const err = { name: 'CastError', message: 'Cast to ObjectId failed' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid identifier format'
      });
    });

    it('should handle duplicate key error with owner+name pattern', (): void => {
      const err = {
        code: 11000,
        keyPattern: { owner: 1, name: 1 },
        keyValue: { owner: 'user1', name: 'MyFolder' }
      };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Folder name already exists for this user'
      });
    });

    it('should handle duplicate key error with name field', (): void => {
      const err = {
        code: 11000,
        keyPattern: { name: 1 },
        keyValue: { name: 'DuplicateName' }
      };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Name already exists'
      });
    });

    it('should handle duplicate key error with generic field', (): void => {
      const err = {
        code: 11000,
        keyValue: { email: 'test@example.com' }
      };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Duplicate value for field(s): email'
      });
    });
  });

  describe('JWT Errors', (): void => {
    it('should handle TokenExpiredError', (): void => {
      const err = { name: 'TokenExpiredError', message: 'jwt expired' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Token expired'
      });
    });

    it('should handle JsonWebTokenError', (): void => {
      const err = { name: 'JsonWebTokenError', message: 'invalid token' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token'
      });
    });
  });

  describe('Multer Errors', (): void => {
    it('should handle LIMIT_FILE_SIZE error', (): void => {
      const err = {
        code: 'LIMIT_FILE_SIZE',
        message: 'File too large'
      };
      errorHandler(err as unknown as Error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'File upload limits exceeded'
      });
    });

    it('should handle LIMIT_FILE_COUNT error', (): void => {
      const err = {
        code: 'LIMIT_FILE_COUNT',
        message: 'Too many files'
      };
      errorHandler(err as unknown as Error, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'File upload limits exceeded'
      });
    });
  });

  describe('Generic Error', (): void => {
    it('should handle unhandled generic error', (): void => {
      const err = new Error('Something went wrong');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error'
      });
    });

    it('should handle error without name property', (): void => {
      const err = { message: 'Unknown error' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error'
      });
    });
  });
});
