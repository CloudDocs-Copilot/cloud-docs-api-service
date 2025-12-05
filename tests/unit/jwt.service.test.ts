import * as jwtService from '../../src/services/jwt.service';

describe('JWT Service', () => {
  const testPayload = {
    id: '123456',
    email: 'test@example.com',
    role: 'user'
  };

  describe('signToken', () => {
    it('debería generar un token válido', () => {
      const token = jwtService.signToken(testPayload);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('el token debería contener tokenCreatedAt', () => {
      const token = jwtService.signToken(testPayload);
      const decoded = jwtService.verifyToken(token);
      expect(decoded).toHaveProperty('tokenCreatedAt');
    });
  });

  describe('verifyToken', () => {
    it('debería verificar un token válido', () => {
      const token = jwtService.signToken(testPayload);
      const decoded = jwtService.verifyToken(token);
      
      expect(decoded.id).toBe(testPayload.id);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('debería lanzar error con token inválido', () => {
      const invalidToken = 'token.invalido.aqui';
      
      expect(() => {
        jwtService.verifyToken(invalidToken);
      }).toThrow();
    });

    it('debería lanzar error con token vacío', () => {
      expect(() => {
        jwtService.verifyToken('');
      }).toThrow();
    });
  });
});
