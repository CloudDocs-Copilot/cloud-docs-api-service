import { Request, Response } from 'express';
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

const mockedAuthService = jest.mocked(authService, { shallow: false });

describe('Auth Controller', (): void => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<(err?: unknown) => void>;

  beforeEach(() => {
    mockRequest = {
      body: {} as Record<string, unknown>,
      params: {} as Record<string, unknown>
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    jest.clearAllMocks();
  });

  describe('register', (): void => {
    it('should register user successfully with valid data', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockUser = { id: '123', name: 'Test User', email: 'test@example.com' };
      mockedAuthService.registerUser.mockResolvedValue(mockUser as unknown as Partial<import('../../../src/models/user.model').IUser>);

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      const body = mockRequest.body as Record<string, unknown>;
      expect(authService.registerUser).toHaveBeenCalledWith(body);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: mockUser
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 400 when name is missing', async (): Promise<void> => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should return 400 when email is missing', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        password: 'SecurePass123!'
      };

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
    });

    it('should return 400 when password is missing', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com'
      };

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Missing required fields (name, email, password)')
      );
    });

    it('should return 409 when email already exists', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'existing@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('duplicate key error');
      mockedAuthService.registerUser.mockRejectedValue(error);

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(409, 'Email already registered'));
    });

    it('should return 400 for invalid email format', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'SecurePass123!'
      };

      const error = new Error('Invalid email format');
      mockedAuthService.registerUser.mockRejectedValue(error);

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid email format'));
    });

    it('should return 400 for invalid name format', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test@User123',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('Name must contain only alphanumeric characters and spaces');
      mockedAuthService.registerUser.mockRejectedValue(error);

      await register(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid name format'));
    });

    it('should return 400 when password validation fails', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'weak'
      };

      const error = new Error('Password validation failed: too short');
      mockedAuthService.registerUser.mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Password validation failed: too short')
      );
    });

    it('should pass through unexpected errors', async (): Promise<void> => {
      mockRequest.body = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('Database connection failed');
      mockedAuthService.registerUser.mockRejectedValue(error);

      await register(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('login', (): void => {
    it('should login user successfully and set HttpOnly cookie', async (): Promise<void> => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult: authService.AuthResponse = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com', name: 'Test User' }
      };
      mockedAuthService.loginUser.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').AuthResponse);

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      const body = mockRequest.body as Record<string, unknown>;
      expect(authService.loginUser).toHaveBeenCalledWith(body);
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

    it('should return 400 when email is missing', async (): Promise<void> => {
      mockRequest.body = { password: 'SecurePass123!' };

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
      expect(authService.loginUser).not.toHaveBeenCalled();
    });

    it('should return 400 when password is missing', async (): Promise<void> => {
      mockRequest.body = { email: 'test@example.com' };

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 404 when user is not found', async (): Promise<void> => {
      mockRequest.body = {
        email: 'nonexistent@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('User not found');
      mockedAuthService.loginUser.mockRejectedValue(error);

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(404, 'Invalid credentials'));
    });

    it('should return 401 for invalid password', async (): Promise<void> => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      const error = new Error('Invalid password');
      mockedAuthService.loginUser.mockRejectedValue(error);

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(401, 'Invalid credentials'));
    });

    it('should return 403 when user account is not active', async (): Promise<void> => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const error = new Error('User account is not active');
      mockedAuthService.loginUser.mockRejectedValue(error);

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(403, 'Account is not active'));
    });

    it('should set secure cookie in production environment', async (): Promise<void> => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult: authService.AuthResponse = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com' }
      };
      mockedAuthService.loginUser.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').AuthResponse);

      await login(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

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

    it('should not expose JWT token in response body', async (): Promise<void> => {
      mockRequest.body = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      const mockResult = {
        token: 'jwt-token-123',
        user: { id: '123', email: 'test@example.com' }
      };
      mockedAuthService.loginUser.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').AuthResponse);

      await login(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.not.objectContaining({ token: expect.anything() })
      );
    });
  });

  describe('logout', (): void => {
    it('should clear token cookie successfully', async (): Promise<void> => {
      await logout(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

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

    it('should use secure settings in production', async (): Promise<void> => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await logout(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({
          secure: true,
          sameSite: 'strict'
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle errors during logout', async (): Promise<void> => {
      const error = new Error('Cookie error');
      (mockResponse.clearCookie as jest.Mock).mockImplementation(() => {
        throw error;
      });

      await logout(mockRequest as unknown as AuthRequest, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('confirmAccount', (): void => {
    it('should confirm account and redirect with confirmed status', async (): Promise<void> => {
      mockRequest.params = { token: 'valid-token-123' };

      const mockResult = { userId: '123', userAlreadyActive: false };
      mockedAuthService.confirmUserAccount.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').ConfirmResult);

      await confirmAccount(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(authService.confirmUserAccount).toHaveBeenCalledWith('valid-token-123');
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('status=confirmed')
      );
    });

    it('should redirect with already_active status when user is already active', async (): Promise<void> => {
      mockRequest.params = { token: 'valid-token-123' };

      const mockResult = { userId: '123', userAlreadyActive: true };
      mockedAuthService.confirmUserAccount.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').ConfirmResult);

      await confirmAccount(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('status=already_active')
      );
    });

    it('should return 400 when token is missing', async (): Promise<void> => {
      mockRequest.params = {};

      await confirmAccount(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Token is required'));
    });

    it('should return 400 when token is invalid', async (): Promise<void> => {
      mockRequest.params = { token: 'invalid-token' };

      mockedAuthService.confirmUserAccount.mockRejectedValue(new Error('Invalid or expired token'));

      await confirmAccount(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid or expired token'));
    });

    it('should use custom frontend URL from environment', async (): Promise<void> => {
      const originalUrl = process.env.CONFIRMATION_FRONTEND_URL;
      process.env.CONFIRMATION_FRONTEND_URL = 'https://custom-frontend.com';

      mockRequest.params = { token: 'valid-token-123' };
      const mockResult = { userId: '123', userAlreadyActive: false };
      mockedAuthService.confirmUserAccount.mockResolvedValue(mockResult as unknown as import('../../../src/services/auth.service').ConfirmResult);

      await confirmAccount(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('https://custom-frontend.com')
      );

      process.env.CONFIRMATION_FRONTEND_URL = originalUrl;
    });
  });

  describe('forgotPassword', (): void => {
    it('should process password reset request successfully', async (): Promise<void> => {
      mockRequest.body = { email: 'test@example.com' };

      mockedAuthService.requestPasswordReset.mockResolvedValue(null);

      await forgotPassword(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(authService.requestPasswordReset).toHaveBeenCalledWith('test@example.com');
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Check your email, a link has been sent'
      });
    });

    it('should return 400 when email is missing', async (): Promise<void> => {
      mockRequest.body = {};

      await forgotPassword(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return same message for non-existent email (anti-enumeration)', async (): Promise<void> => {
      mockRequest.body = { email: 'nonexistent@example.com' };

      mockedAuthService.requestPasswordReset.mockResolvedValue(null);

      await forgotPassword(mockRequest as unknown as Request, mockResponse as unknown as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Check your email, a link has been sent'
      });
    });
  });

  describe('resetPasswordController', (): void => {
    it('should reset password successfully', async (): Promise<void> => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      mockedAuthService.resetPassword.mockResolvedValue(undefined);

      await resetPasswordController(mockRequest as unknown as Request, mockResponse as Response, mockNext);

      const body = mockRequest.body as Record<string, unknown>;
      expect(authService.resetPassword).toHaveBeenCalledWith(body);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('token', expect.any(Object));
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Password reset successful'
      });
    });

    it('should return 400 when token is missing', async (): Promise<void> => {
      mockRequest.body = {
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest as unknown as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 400 when newPassword is missing', async (): Promise<void> => {
      mockRequest.body = {
        token: 'reset-token-123',
        confirmPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest as unknown as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should return 400 when confirmPassword is missing', async (): Promise<void> => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!'
      };

      await resetPasswordController(mockRequest as unknown as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Missing required fields'));
    });

    it('should clear auth cookie after password reset', async (): Promise<void> => {
      mockRequest.body = {
        token: 'reset-token-123',
        newPassword: 'NewSecurePass123!',
        confirmPassword: 'NewSecurePass123!'
      };

      mockedAuthService.resetPassword.mockResolvedValue(undefined);

      await resetPasswordController(mockRequest as unknown as Request, mockResponse as Response, mockNext);

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
