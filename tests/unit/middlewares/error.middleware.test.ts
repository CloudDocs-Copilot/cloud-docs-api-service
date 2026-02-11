// Unit tests for error.middleware.ts (improve branch coverage)
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../src/middlewares/error.middleware';
import HttpError from '../../../src/models/error.model';

describe('error.middleware', () => {
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

  describe('HttpError', () => {
    it('should handle HttpError with custom status and message', () => {
      const err = new HttpError(404, 'Resource not found');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found'
      });
    });

    it('should handle HttpError with 403', () => {
      const err = new HttpError(403, 'Forbidden');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden'
      });
    });
  });

  describe('Mongoose Errors', () => {
    it('should handle ValidationError', () => {
      const err = { name: 'ValidationError', message: 'Validation failed' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed'
      });
    });

    it('should handle CastError', () => {
      const err = { name: 'CastError', message: 'Cast to ObjectId failed' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid identifier format'
      });
    });

    it('should handle duplicate key error with owner+name pattern', () => {
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

    it('should handle duplicate key error with name field', () => {
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

    it('should handle duplicate key error with generic field', () => {
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

  describe('JWT Errors', () => {
    it('should handle TokenExpiredError', () => {
      const err = { name: 'TokenExpiredError', message: 'jwt expired' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Token expired'
      });
    });

    it('should handle JsonWebTokenError', () => {
      const err = { name: 'JsonWebTokenError', message: 'invalid token' };
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token'
      });
    });
  });

  describe('Multer Errors', () => {
    it('should handle LIMIT_FILE_SIZE error', () => {
      const err = { 
        code: 'LIMIT_FILE_SIZE', 
        message: 'File too large' 
      };
      errorHandler(err as any, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'File upload limits exceeded'
      });
    });

    it('should handle LIMIT_FILE_COUNT error', () => {
      const err = { 
        code: 'LIMIT_FILE_COUNT', 
        message: 'Too many files' 
      };
      errorHandler(err as any, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'File upload limits exceeded'
      });
    });
  });

  describe('Generic Error', () => {
    it('should handle unhandled generic error', () => {
      const err = new Error('Something went wrong');
      errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error'
      });
    });

    it('should handle error without name property', () => {
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
