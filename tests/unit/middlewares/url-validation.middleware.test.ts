const mockValidateUrl = jest.fn();

jest.mock('../../../src/utils/url-validator', () => ({
  validateUrl: mockValidateUrl,
  URL_VALIDATION_CONFIG: { allowedSchemes: ['http', 'https'], maxLength: 200 }
}));

import {
  validateUrlMiddleware,
  validateWebhookUrl,
  validateImageUrl,
  validateRedirectUrl,
  validateQueryUrl,
  scanForUrls
} from '../../../src/middlewares/url-validation.middleware';
import HttpError from '../../../src/models/error.model';
import { Request, Response, NextFunction } from 'express';

describe('URL Validation Middleware', (): void => {
  let mockNext: jest.MockedFunction<NextFunction>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
    mockRequest = { body: {}, query: {} };
    mockResponse = {};

    // Configure mock implementation
    mockValidateUrl.mockImplementation((url: string, allowedDomains?: string[]) => {
      if (!url || typeof url !== 'string') {
        return { isValid: false, errors: ['Invalid URL format'] };
      }

      let hostname: string | null = null;
      let parsed: URL;
      try {
        parsed = new URL(url);
        hostname = parsed.hostname.toLowerCase();
      } catch {
        // If URL parsing fails, treat the URL as invalid rather than relying on substring checks.
        return { isValid: false, errors: ['Invalid URL format'] };
      }

      if (
        parsed.protocol === 'https:' &&
        (hostname === 'ok.com' ||
          hostname === 'trusted.com' ||
          hostname === 'cdn.example.com')
      ) {
        return { isValid: true, errors: [] };
      }

      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        return { isValid: false, errors: ['Private IP detected'] };
      }

      if (url.startsWith('ftp://')) {
        return { isValid: false, errors: ['Unsupported protocol'] };
      }

      if (
        hostname === 'evil.com' ||
        hostname.endsWith('.evil.com')
      ) {
        return { isValid: false, errors: ['Suspicious domain'] };
      }

      return { isValid: false, errors: ['invalid'] };
    });
  });

  describe('validateUrlMiddleware', (): void => {
    it('should allow valid URL in specified field', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['url'] });
      mockRequest.body = { url: 'https://ok.com' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid URL in strict mode', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['url'], strict: true });
      mockRequest.body = { url: 'http://bad-url' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      const error = mockNext.mock.calls[0][0] as unknown as HttpError;
      expect(error).toBeInstanceOf(HttpError);
      expect(error.statusCode).toBe(400);
    });

    it('should allow invalid URL when strict mode is disabled', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['url'], strict: false });
      mockRequest.body = { url: 'http://bad-url' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should validate array of URLs and reject if any invalid', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['urls'] });
      mockRequest.body = { urls: ['https://ok.com', 'http://bad-url'] };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should skip validation when field is not present', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['url'] });
      mockRequest.body = {};

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should validate multiple fields simultaneously', (): void => {
      // Arrange
      const middleware = validateUrlMiddleware({ fields: ['url1', 'url2'] });
      mockRequest.body = {
        url1: 'https://ok.com',
        url2: 'https://trusted.com'
      };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('validateWebhookUrl', (): void => {
    it('should allow valid webhook URL', (): void => {
      // Arrange
      mockRequest.body = { webhookUrl: 'https://ok.com' };

      // Act
      validateWebhookUrl(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject private IP addresses in webhook URLs', (): void => {
      // Arrange
      mockRequest.body = { webhookUrl: 'http://127.0.0.1/secret' };

      // Act
      validateWebhookUrl(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should reject localhost in webhook URLs', (): void => {
      // Arrange
      mockRequest.body = { callbackUrl: 'http://localhost:8080/callback' };

      // Act
      validateWebhookUrl(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('validateImageUrl', (): void => {
    it('should allow valid image URL from allowed domain', (): void => {
      // Arrange
      const middleware = validateImageUrl();
      mockRequest.body = { imageUrl: 'https://cdn.example.com/image.png' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should validate avatarUrl field', (): void => {
      // Arrange
      const middleware = validateImageUrl();
      mockRequest.body = { avatarUrl: 'https://cdn.example.com/avatar.jpg' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid image URLs', (): void => {
      // Arrange
      const middleware = validateImageUrl();
      mockRequest.body = { imageUrl: 'http://bad-domain.com/image.png' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('validateRedirectUrl', (): void => {
    it('should throw error when allowedDomains is empty', (): void => {
      // Arrange & Act & Assert
      expect(() => validateRedirectUrl([])).toThrow(
        'allowedDomains is required for redirect URL validation'
      );
    });

    it('should throw error when allowedDomains is not provided', (): void => {
      // Arrange & Act & Assert
      expect(() => validateRedirectUrl(undefined as unknown as string[])).toThrow();
    });

    it('should allow redirect URL from allowed domain', (): void => {
      // Arrange
      const middleware = validateRedirectUrl(['ok.com']);
      mockRequest.body = { redirectUrl: 'https://ok.com/return' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('validateQueryUrl', (): void => {
    it('should validate URL in query parameters', (): void => {
      // Arrange
      const middleware = validateQueryUrl(['url']);
      mockRequest.query = { url: 'https://ok.com' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject unsupported protocol in query URL', (): void => {
      // Arrange
      const middleware = validateQueryUrl(['url']);
      mockRequest.query = { url: 'ftp://example.com/path' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      const error = mockNext.mock.calls[0][0] as unknown as HttpError;
      expect(error.message).toContain('Invalid URL in query parameters');
    });

    it('should handle array values in query parameters', (): void => {
      // Arrange
      const middleware = validateQueryUrl(['url']);
      mockRequest.query = { url: ['https://ok.com', 'https://trusted.com'] };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('scanForUrls', (): void => {
    it('should detect and reject suspicious URLs in body strings', (): void => {
      // Arrange
      const middleware = scanForUrls(['trusted.com']);
      mockRequest.body = { text: 'Click here http://evil.com/malware' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
      const error = mockNext.mock.calls[0][0] as unknown as HttpError;
      expect(error.message).toContain('Suspicious URLs detected');
    });

    it('should allow trusted URLs in body strings', (): void => {
      // Arrange
      const middleware = scanForUrls(['trusted.com']);
      mockRequest.body = { text: 'Visit https://trusted.com for more info' };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should recursively scan nested objects for URLs', (): void => {
      // Arrange
      const middleware = scanForUrls(['trusted.com']);
      mockRequest.body = {
        user: {
          profile: {
            bio: 'Check out http://evil.com/phishing'
          }
        }
      };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('should scan arrays for URLs', (): void => {
      // Arrange
      const middleware = scanForUrls(['trusted.com']);
      mockRequest.body = {
        comments: ['Great post!', 'Visit http://evil.com now']
      };

      // Act
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });
});
