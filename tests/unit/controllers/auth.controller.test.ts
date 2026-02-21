import { Response } from 'express';
import { AuthRequest } from '../../../src/middlewares/auth.middleware';
import {
  register,
  login,
  logout,
  confirmAccount,
  forgotPassword,
  resetPasswordController
} from '../../../src/controllers/auth.controller';
import * as authService from '../../../src/services/auth.service';
import HttpError from '../../../src/models/error.model';

jest.mock('../../../src/services/auth.service');

describe('Auth Controller', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      body: {},
      params: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register user successfully with valid data', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
      (authService.registerUser as jest.Mock).mockResolvedValue(mockUser);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(authService.registerUser).toHaveBeenCalledWith(mockRequest.body);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: mockUser
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 400 when name is missing', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should return 400 when email is missing', async () => {
      mockRequest.body = {
        name: 'Test User',
        password: 'SecurePass123!'
      };

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
    });

    it('should return 400 when password is missing', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com'
      };

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
    });

    it('should return 409 when email already exists', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'existing@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('duplicate key error');
      (authService.registerUser as jest.Mock).mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(409, 'Email already registered'));
    });

    it('should return 400 for invalid email format', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'SecurePass123!'
      };

      const error = new Error('Invalid email format');
      (authService.registerUser as jest.Mock).mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid email format'));
    });

    it('should return 400 for invalid name format', async () => {
      mockRequest.body = {
        name: 'Test@User123',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('Name must contain only alphanumeric characters and spaces');
      (authService.registerUser as jest.Mock).mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid name format'));
    });

    it('should return 400 when password validation fails', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'weak'
      };

      const error = new Error('Password validation failed: too short');
      (authService.registerUser as jest.Mock).mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Password validation failed: too short'));
    });

    it('should pass through unexpected errors', async () => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('Database connection failed');
      (authService.registerUser as jest.Mock).mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('login', () => {
    it('should login user successfully and set HttpOnly cookie', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com', name: 'Test User' }
      };
      (authService.loginUser as jest.Mock).mockResolvedValue(mockResult);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(authService.loginUser).toHaveBeenCalledWith(mockRequest.body);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'token',
        'jwt-token-123',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          maxAge: 24 * 60 * 60 * 1000
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Login successful',
        user: mockResult.user
      });
    });

    it('should return 400 when email is missing', async () => {
      mockRequest.body = { password: 'SecurePass123!' };

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
      expect(authService.loginUser).not.toHaveBeenCalled();
    });

    it('should return 400 when password is missing', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 404 when user is not found', async () => {
      mockRequest.body = {
        email: 'nonexistent@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('User not found');
      (authService.loginUser as jest.Mock).mockRejectedValue(error);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(404, 'Invalid credentials'));
    });

    it('should return 401 for invalid password', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      const error = new Error('Invalid password');
      (authService.loginUser as jest.Mock).mockRejectedValue(error);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(401, 'Invalid credentials'));
    });

    it('should return 403 when user account is not active', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('User account is not active');
      (authService.loginUser as jest.Mock).mockRejectedValue(error);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(403, 'Account is not active'));
    });

    it('should set secure cookie in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com' }
      };
      (authService.loginUser as jest.Mock).mockResolvedValue(mockResult);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'token',
        'jwt-token-123',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'strict'
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not expose JWT token in response body', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com' }
      };
      (authService.loginUser as jest.Mock).mockResolvedValue(mockResult);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.not.objectContaining({ token: expect.anything() })
      );
    });
  });

  describe('logout', () => {
    it('should clear token cookie successfully', async () => {
      await logout(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          httpOnly: true,
          path: '/'
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Logout successful' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use secure settings in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await logout(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          secure: true,
          sameSite: 'strict'
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle errors during logout', async () => {
      const error = new Error('Cookie error');
      (mockResponse.clearCookie as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await logout(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('confirmAccount', () => {
    it('should confirm account and redirect with confirmed status', async () => {
      mockRequest.params = { token: 'valid-token-123' };

      const mockResult = { userId: '123', userAlreadyActive: false };
      (authService.confirmUserAccount as jest.Mock).mockResolvedValue(mockResult);

      await confirmAccount(mockRequest, mockResponse as Response, mockNext);

      expect(authService.confirmUserAccount).toHaveBeenCalledWith('valid-token-123');
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('status=confirmed')
      );
    });

    it('should redirect with already_active status when user is already active', async () => {
      mockRequest.params = { token: 'valid-token-123' };

      const mockResult = { userId: '123', userAlreadyActive: true };
      (authService.confirmUserAccount as jest.Mock).mockResolvedValue(mockResult);

      await confirmAccount(mockRequest, mockResponse as Response, mockNext);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('status=already_active')
      );
    });

    it('should return 400 when token is missing', async () => {
      mockRequest.params = {};

      await confirmAccount(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Token is required'));
    });

    it('should return 400 when token is invalid', async () => {
      mockRequest.params = { token: 'invalid-token' };

      (authService.confirmUserAccount as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired token')
      );

      await confirmAccount(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Invalid or expired token')
      );
    });

    it('should use custom frontend URL from environment', async () => {
      const originalUrl = process.env.CONFIRMATION_FRONTEND_URL;
      process.env.CONFIRMATION_FRONTEND_URL = 'https://custom-frontend.com';

      mockRequest.params = { token: 'valid-token-123' };
      const mockResult = { userId: '123', userAlreadyActive: false };
      (authService.confirmUserAccount as jest.Mock).mockResolvedValue(mockResult);

      await confirmAccount(mockRequest, mockResponse as Response, mockNext);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('https://custom-frontend.com')
      );

      process.env.CONFIRMATION_FRONTEND_URL = originalUrl;
    });
  });

  describe('forgotPassword', () => {
    it('should process password reset request successfully', async () => {
      mockRequest.body = { email: 'test@example.com' };

      (authService.requestPasswordReset as jest.Mock).mockResolvedValue(undefined);

      await forgotPassword(mockRequest, mockResponse as Response, mockNext);

      expect(authService.requestPasswordReset).toHaveBeenCalledWith('test@example.com');
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Check your email, a link has been sent'
      });
    });

    it('should return 400 when email is missing', async () => {
      mockRequest.body = {};

      await forgotPassword(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return same message for non-existent email (anti-enumeration)', async () => {
      mockRequest.body = { email: 'nonexistent@example.com' };

      (authService.requestPasswordReset as jest.Mock).mockResolvedValue(undefined);

      await forgotPassword(mockRequest, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Check your email, a link has been sent'
      });
    });
  });

  describe('resetPasswordController', () => {
    it('should reset password successfully', async () => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      (authService.resetPassword as jest.Mock).mockResolvedValue(undefined);

      await resetPasswordController(mockRequest, mockResponse as Response, mockNext);

      expect(authService.resetPassword).toHaveBeenCalledWith(mockRequest.body);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('token', expect.any(Object));
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Password reset successful'
      });
    });

    it('should return 400 when token is missing', async () => {
      mockRequest.body = {
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 400 when newPassword is missing', async () => {
      mockRequest.body = {
        token: 'reset-token-123',
        confirmPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 400 when confirmPassword is missing', async () => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should clear auth cookie after password reset', async () => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      (authService.resetPassword as jest.Mock).mockResolvedValue(undefined);

      await resetPasswordController(mockRequest, mockResponse as Response, mockNext);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          httpOnly: true,
          path: '/'
        })
      );
    });
  });
});
