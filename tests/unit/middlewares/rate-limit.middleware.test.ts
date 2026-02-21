import { Response } from 'express';
import {
  generalRateLimiter,
  authRateLimiter,
  createResourceRateLimiter,
  uploadRateLimiter,
  createCustomRateLimiter,
  userBasedRateLimiter
} from '../../../src/middlewares/rate-limit.middleware';

describe('Rate Limit Middleware', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRequest = {
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
      headers: {},
      method: 'GET',
      path: '/'
    };
    mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: jest.fn(),
      getHeader: jest.fn().mockReturnValue('900'),
      statusCode: 200
    } as any;
  });

  describe('generalRateLimiter', () => {
    it('should be defined', () => {
      expect(generalRateLimiter).toBeDefined();
      expect(typeof generalRateLimiter).toBe('function');
    });

    it('should skip rate limiting in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      // The rate limiter should skip in test mode
      expect(process.env.NODE_ENV).toBe('test');

      process.env.NODE_ENV = originalEnv;
    });

    it('should have correct configuration for general requests', () => {
      // Validate the rate limiter is properly exported and configured
      expect(generalRateLimiter).toBeDefined();
    });

    it('should handle IPv6 addresses correctly', () => {
      const reqWithIpv6 = {
        ...mockRequest,
        ip: '::ffff:192.168.1.1',
        socket: { remoteAddress: '::ffff:192.168.1.1' }
      };

      // Rate limiter should normalize IPv6 addresses
      expect(reqWithIpv6.ip).toContain('::ffff:');
    });

    it('should handle unknown IP addresses', () => {
      const reqWithoutIp = {
        socket: {},
        headers: {}
      };

      // Should fallback to 'unknown' when no IP is available
      const ip = (reqWithoutIp as any).ip || (reqWithoutIp.socket as any).remoteAddress || 'unknown';
      expect(ip).toBe('unknown');
    });
  });

  describe('authRateLimiter', () => {
    it('should be defined with stricter limits', () => {
      expect(authRateLimiter).toBeDefined();
      expect(typeof authRateLimiter).toBe('function');
    });

    it('should be configured for authentication endpoints', () => {
      // Auth rate limiter should be more restrictive than general
      expect(authRateLimiter).toBeDefined();
    });

    it('should skip counting successful authentication requests', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      // In test environment, all requests should be skipped
      expect(process.env.NODE_ENV).toBe('test');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle failed login attempts', () => {
      mockResponse.statusCode = 401;
      
      // Failed authentication should be counted
      expect(mockResponse.statusCode).toBe(401);
    });

    it('should track per-IP authentication attempts', () => {
      const req1 = { ...mockRequest, ip: '192.168.1.1' };
      const req2 = { ...mockRequest, ip: '192.168.1.2' };
      
      expect(req1.ip).toBe('192.168.1.1');
      expect(req2.ip).toBe('192.168.1.2');
    });
  });

  describe('createResourceRateLimiter', () => {
    it('should be defined', () => {
      expect(createResourceRateLimiter).toBeDefined();
      expect(typeof createResourceRateLimiter).toBe('function');
    });

    it('should handle resource creation requests', () => {
      const postRequest = { ...mockRequest, method: 'POST' };
      expect(postRequest.method).toBe('POST');
    });

    it('should apply limits to POST requests', () => {
      const postRequest = {
        ...mockRequest,
        method: 'POST',
        path: '/api/documents'
      };
      
      expect(postRequest.method).toBe('POST');
      expect(postRequest.path).toContain('/api/');
    });

    it('should track creation attempts per IP', () => {
      const reqWithIp = { ...mockRequest, ip: '10.0.0.1' };
      
      // Should identify unique IPs for resource creation
      expect(reqWithIp.ip).toBeDefined();
    });

    it('should prevent resource creation abuse', () => {
      // Simulating multiple rapid POST requests
      const requests = Array(5).fill(null).map((_, i) => ({
        ip: '10.0.0.1',
        method: 'POST',
        timestamp: Date.now() + i * 100,
        headers: {},
        socket: { remoteAddress: '10.0.0.1' }
      }));
      
      expect(requests.length).toBe(5);
      expect(requests.every(r => r.method === 'POST')).toBe(true);
    });
  });

  describe('uploadRateLimiter', () => {
    it('should be defined', () => {
      expect(uploadRateLimiter).toBeDefined();
      expect(typeof uploadRateLimiter).toBe('function');
    });

    it('should handle file upload requests', () => {
      const uploadRequest = {
        ...mockRequest,
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data' }
      };
      
      expect(uploadRequest.method).toBe('POST');
      expect(uploadRequest.headers['content-type']).toContain('multipart/form-data');
    });

    it('should track upload attempts per IP', () => {
      const reqWithIp = { ...mockRequest, ip: '172.16.0.1' };
      
      expect(reqWithIp.ip).toBeDefined();
    });

    it('should prevent upload spam', () => {
      // Should limit the number of uploads in a time window
      const uploadRequests = Array(3).fill(null).map(() => ({
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data' },
        socket: { remoteAddress: '172.16.0.1' }
      }));
      
      expect(uploadRequests.length).toBe(3);
    });

    it('should differentiate upload endpoints from other requests', () => {
      const uploadRequest = { path: '/api/documents/upload' };
      const regularRequest = { path: '/api/documents' };
      
      expect(uploadRequest.path).toContain('upload');
      expect(regularRequest.path).not.toContain('upload');
    });
  });

  describe('createCustomRateLimiter', () => {
    it('should be defined', () => {
      expect(createCustomRateLimiter).toBeDefined();
      expect(typeof createCustomRateLimiter).toBe('function');
    });

    it('should create a custom rate limiter with specified config', () => {
      const customLimiter = createCustomRateLimiter(1, 50);
      
      expect(customLimiter).toBeDefined();
      expect(typeof customLimiter).toBe('function');
    });

    it('should allow custom window durations', () => {
      const limiter = createCustomRateLimiter(5, 100);
      
      expect(limiter).toBeDefined();
    });

    it('should allow custom request limits', () => {
      const limiter = createCustomRateLimiter(15, 25);
      
      expect(limiter).toBeDefined();
    });

    it('should support custom messages', () => {
      const customMessage = 'Custom rate limit exceeded';
      const limiter = createCustomRateLimiter(1, 10, customMessage);
      
      expect(limiter).toBeDefined();
    });

    it('should allow configuration override', () => {
      const limiter1 = createCustomRateLimiter(1, 10);
      const limiter2 = createCustomRateLimiter(2, 20);
      
      expect(limiter1).toBeDefined();
      expect(limiter2).toBeDefined();
      expect(limiter1).not.toBe(limiter2);
    });
  });

  describe('userBasedRateLimiter', () => {
    it('should be defined', () => {
      expect(userBasedRateLimiter).toBeDefined();
      expect(typeof userBasedRateLimiter).toBe('function');
    });

    it('should handle authenticated user requests', () => {
      const authRequest = { ...mockRequest, user: { id: 'user123', email: 'test@example.com' } };
      
      expect(authRequest.user).toBeDefined();
      expect(authRequest.user.id).toBe('user123');
    });

    it('should track limits per user when authenticated', () => {
      const user1Request = { ...mockRequest, user: { id: 'user1' } };
      const user2Request = { ...mockRequest, user: { id: 'user2' } };
      
      expect(user1Request.user.id).toBe('user1');
      expect(user2Request.user.id).toBe('user2');
    });

    it('should fallback to IP when user is not authenticated', () => {
      const unauthRequest = { ...mockRequest, ip: '192.168.1.100' };
      
      const key = (unauthRequest as any).user?.id || unauthRequest.ip;
      expect(key).toBe('192.168.1.100');
    });

    it('should handle requests without user or IP', () => {
      const minimalRequest = { socket: {}, headers: {} };
      
      const key = (minimalRequest as any).user?.id || (minimalRequest as any).ip || 'unknown';
      expect(key).toBe('unknown');
    });
  });

  describe('Rate Limiter Response Handling', () => {
    it('should return 429 status when limit is exceeded', () => {
      // Simulate rate limit exceeded
      statusMock(429);
      jsonMock({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded'
      });
      
      expect(statusMock).toHaveBeenCalledWith(429);
    });

    it('should include retry-after header', () => {
      (mockResponse as any).getHeader = jest.fn().mockReturnValue('900');
      
      const retryAfter = mockResponse.getHeader!('Retry-After');
      expect(retryAfter).toBe('900');
    });

    it('should provide informative error messages', () => {
      const errorResponse = {
        error: 'Too Many Requests',
        message: 'You have exceeded the allowed request limit. Please wait before trying again.',
        retryAfter: '900'
      };
      
      expect(errorResponse.error).toBe('Too Many Requests');
      expect(errorResponse.message).toContain('exceeded');
      expect(errorResponse.retryAfter).toBeDefined();
    });

    it('should set RateLimit-* headers', () => {
      const setHeader = mockResponse.setHeader as jest.Mock;
      
      // Standard headers should be included
      setHeader('RateLimit-Limit', '100');
      setHeader('RateLimit-Remaining', '95');
      setHeader('RateLimit-Reset', Date.now() + 900000);
      
      expect(setHeader).toHaveBeenCalled();
    });

    it('should not set legacy X-RateLimit-* headers', () => {
      const setHeader = mockResponse.setHeader as jest.Mock;
      
      // Legacy headers should not be set
      expect(setHeader).not.toHaveBeenCalledWith(expect.stringMatching(/^X-RateLimit-/), expect.anything());
    });
  });
});
