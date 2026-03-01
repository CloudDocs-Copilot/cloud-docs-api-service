/**
 * Tests de integración para configuración CORS
 *
 * Verifica que los headers CORS estén correctamente configurados,
 * especialmente para soportar el header X-Csrf-Token requerido por
 * las operaciones de subida de documentos.
 */

import { request, app } from '../setup';

describe('CORS Configuration', (): void => {
  const allowedOrigin = 'http://localhost:5173';

  describe('Preflight Requests (OPTIONS)', () => {
    it('debe permitir X-Csrf-Token en Access-Control-Allow-Headers', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents/upload')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-Csrf-Token, Content-Type');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-headers']).toBeDefined();

      const allowedHeaders = response.headers['access-control-allow-headers'].toLowerCase();
      expect(allowedHeaders).toContain('x-csrf-token');
      expect(allowedHeaders).toContain('content-type');
    });

    it('debe permitir Authorization header', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

      expect(response.status).toBe(204);

      const allowedHeaders = response.headers['access-control-allow-headers'].toLowerCase();
      expect(allowedHeaders).toContain('authorization');
    });

    it('debe permitir métodos HTTP comunes', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);

      const allowedMethods = response.headers['access-control-allow-methods'];
      expect(allowedMethods).toContain('GET');
      expect(allowedMethods).toContain('POST');
      expect(allowedMethods).toContain('PUT');
      expect(allowedMethods).toContain('DELETE');
    });

    it('debe incluir Access-Control-Allow-Credentials', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('debe incluir Access-Control-Max-Age para caché de preflight', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-max-age']).toBeDefined();
    });
  });

  describe('Allowed Origins', (): void => {
    it('debe aceptar solicitudes desde localhost:5173', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/auth/csrf-token')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('debe aceptar solicitudes desde localhost:3000', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/auth/csrf-token')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('debe aceptar solicitudes desde 127.0.0.1:5173', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/auth/csrf-token')
        .set('Origin', 'http://127.0.0.1:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    });
  });

  describe('Exposed Headers', (): void => {
    it('debe exponer headers necesarios al cliente', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);

      const exposedHeaders = response.headers['access-control-expose-headers'];
      if (exposedHeaders) {
        // Verificar headers comunes expuestos
        expect(exposedHeaders.toLowerCase()).toContain('content-length');
      }
    });
  });

  describe('Document Upload Endpoint CORS', (): void => {
    it('debe permitir preflight para POST /api/documents/upload con headers requeridos', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents/upload')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, X-Csrf-Token, Authorization');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);

      const allowedHeaders = response.headers['access-control-allow-headers'].toLowerCase();
      expect(allowedHeaders).toContain('content-type');
      expect(allowedHeaders).toContain('x-csrf-token');
      expect(allowedHeaders).toContain('authorization');
    });

    it('debe permitir preflight para multipart/form-data', async (): Promise<void> => {
      const response = await request(app)
        .options('/api/documents/upload')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect(response.status).toBe(204);
    });
  });
});
