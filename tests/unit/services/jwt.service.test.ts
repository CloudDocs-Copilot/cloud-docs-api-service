import * as jwtService from '../../../src/services/jwt.service';

/**
 * Tests unitarios para el servicio JWT
 * Prueba la generación y verificación de tokens JWT
 */
describe('JWT Service', (): void => {
  const testPayload = {
    id: '123456',
    email: 'test@example.com',
    role: 'user'
  };

  describe('signToken', (): void => {
    it('should generate a valid token', (): void => {
      const token = jwtService.signToken(testPayload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('token should contain tokenCreatedAt', (): void => {
      const token = jwtService.signToken(testPayload);
      const decoded = jwtService.verifyToken(token);
      expect(decoded).toHaveProperty('tokenCreatedAt');
    });
  });

  describe('verifyToken', (): void => {
    it('should verify a valid token', (): void => {
      const token = jwtService.signToken(testPayload);
      const decoded = jwtService.verifyToken(token);

      expect(decoded.id).toBe(testPayload.id);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should throw error with invalid token', (): void => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        jwtService.verifyToken(invalidToken);
      }).toThrow();
    });

    it('should throw error with empty token', (): void => {
      expect(() => {
        jwtService.verifyToken('');
      }).toThrow();
    });
  });
});
