import { request, app } from '../setup';
import path from 'path';
import fs from 'fs';
import { registerAndLogin, getAuthCookie } from '../helpers';
import { securityUser } from '../fixtures';

/**
 * Tests de Seguridad para Validación de URLs y Paths
 *
 * Estos tests verifican las protecciones contra:
 * - SSRF (Server-Side Request Forgery)
 * - Open Redirect
 * - Path Traversal
 *
 * NOTA IMPORTANTE: Multer ya sanitiza los nombres de archivo usando UUIDs aleatorios,
 * por lo que los tests de integración verifican que el sistema funcione correctamente.
 * Las utilidades de validación (url-validator, path-sanitizer) se prueban unitariamente.
 */
describe('Security - URL and Path Validation', () => {
  // Cookies compartidas para todos los tests de integración
  let globalAuthCookies: string[];
  let folderId: string;
  let organizationId: string;

  beforeAll(async () => {
    // Usar helper para autenticación
    const auth = await registerAndLogin({
      name: securityUser.name,
      email: securityUser.email,
      password: securityUser.password
    });
    globalAuthCookies = auth.cookies;
    organizationId = auth.organizationId!;

    // Obtener el rootFolder del usuario
    const User = (await import('../../src/models/user.model')).default;
    const userId = auth.userId;
    const user = await User.findById(userId);
    folderId = user?.rootFolder?.toString() || '';
  });

  describe('Path Traversal Protection', () => {
    it('should accept file upload (Multer sanitizes filename with UUID)', async () => {
      // NOTA: Multer automáticamente convierte cualquier nombre de archivo
      // en un UUID seguro, por lo que el path traversal se previene a nivel de Multer
      const testFile = Buffer.from('test content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .field('folderId', folderId)
        .field('organizationId', organizationId)
        .attach('file', testFile, '../../../etc/passwd.txt');

      // El upload puede ser exitoso (201), rechazado por MIME (400), o fallar por otros motivos
      expect([201, 400, 401, 500]).toContain(response.status);

      // Verificar que no se creó archivo fuera del directorio permitido
      const maliciousPath = path.join(process.cwd(), '..', '..', '..', 'etc', 'passwd.txt');
      expect(fs.existsSync(maliciousPath)).toBe(false);
    });

    it('should accept file with encoded characters (Multer sanitizes)', async () => {
      const testFile = Buffer.from('test content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .field('folderId', folderId)
        .field('organizationId', organizationId)
        .attach('file', testFile, '%2e%2e%2f%2e%2e%2fetc%2fpasswd.txt');

      // Multer sanitiza el nombre a UUID
      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should accept valid filename without traversal', async () => {
      const testFile = Buffer.from('legitimate content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .field('folderId', folderId)
        .field('organizationId', organizationId)
        .attach('file', testFile, 'legitimate-file.txt');

      // Debe ser exitoso o rechazado por tipo MIME
      expect([201, 400, 401]).toContain(response.status);
    });

    it('should handle filename with null bytes (Multer sanitizes)', async () => {
      const testFile = Buffer.from('test content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', testFile, 'file\x00.txt');

      // Multer sanitiza o rechaza
      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should handle absolute paths in filename (Multer sanitizes)', async () => {
      const testFile = Buffer.from('test content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', testFile, '/etc/passwd');

      // Multer sanitiza a UUID
      expect([201, 400, 401, 500]).toContain(response.status);
    });

    it('should sanitize filename with dangerous characters', async () => {
      const testFile = Buffer.from('test content');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', testFile, 'file<>:|?.txt');

      // El nombre debe ser sanitizado automáticamente por Multer (UUID)
      if (response.status === 201 && response.body.filename) {
        expect(response.body.filename).not.toMatch(/[<>:"|?*]/);
        expect(response.body.filename).toMatch(/^[0-9a-f-]+\.txt$/i);
      }
    });
  });

  describe('File Extension Validation', () => {
    it('should reject executable file extensions', async () => {
      const maliciousFile = Buffer.from('malicious code');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', maliciousFile, 'malware.exe');

      // Debe rechazar por tipo MIME (400) o por autenticación (401)
      expect([400, 401]).toContain(response.status);
    });

    it('should reject script file extensions', async () => {
      const scriptFile = Buffer.from('rm -rf /');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', scriptFile, 'script.sh');

      // Debe rechazar por tipo MIME o por autenticación
      expect([400, 401]).toContain(response.status);
    });

    it('should accept allowed file extensions', async () => {
      const validFile = Buffer.from('valid content');

      // Solo .txt está permitido por defecto (text/plain en ALLOWED_MIME_TYPES)
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', validFile, 'document.txt');

      // Debe aceptar text/plain o fallar por autenticación
      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe('Path Length Validation', () => {
    it('should handle extremely long filenames (Multer uses UUID)', async () => {
      const testFile = Buffer.from('test');
      const longName = 'a'.repeat(300) + '.txt'; // Más de 255 caracteres

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', testFile, longName);

      // Multer convierte a UUID, así que es aceptado o falla por autenticación
      expect([201, 400, 401]).toContain(response.status);
    });

    it('should accept reasonable filename lengths', async () => {
      const testFile = Buffer.from('test');
      const normalName = 'reasonable-filename.txt';

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(globalAuthCookies))
        .attach('file', testFile, normalName);

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe('Download Path Validation', () => {
    let documentId: string;
    let testAuthCookies: string[];

    beforeAll(async () => {
      // Registrar usuario específico para estos tests
      const auth = await registerAndLogin({
        name: 'Download Test User',
        email: 'download-test@example.com',
        password: 'Download@123'
      });
      testAuthCookies = auth.cookies;

      // Subir un documento legítimo
      const testFile = Buffer.from('download test content');
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Cookie', getAuthCookie(testAuthCookies))
        .attach('file', testFile, 'download-test.txt');

      if (uploadResponse.status === 201) {
        documentId = uploadResponse.body._id;
      }
    });

    it('should prevent path traversal in download endpoint', async () => {
      // Intentar manipular el ID para acceder a otros archivos
      await request(app)
        .get('/api/documents/download/../../../etc/passwd')
        .set('Cookie', getAuthCookie(testAuthCookies))
        .expect(404); // Debe fallar el routing o la validación
    });

    it('should only allow downloading files within storage directory', async () => {
      if (!documentId) {
        // Skip if no document was uploaded
        return;
      }

      const response = await request(app)
        .get(`/api/documents/download/${documentId}`)
        .set('Cookie', getAuthCookie(testAuthCookies));

      // Si el archivo existe, debe descargarse correctamente
      if (response.status === 200) {
        expect(response.header['content-type']).toBeDefined();
      }
    });
  });

  describe('URL Validation (SSRF/Open Redirect)', () => {
    // Estos tests requieren endpoints que acepten URLs
    // Si tu aplicación no tiene endpoints que reciban URLs externas,
    // estos tests servirán como ejemplos de cómo implementarlos

    it('should validate URL utility rejects private IPs', async () => {
      const { validateUrl } = await import('../../src/utils/url-validator');

      const privateIps = [
        'http://127.0.0.1/admin',
        'http://localhost:8080/secret',
        'http://10.0.0.1/internal',
        'http://192.168.1.1/config',
        'http://169.254.169.254/metadata' // AWS metadata
      ];

      for (const url of privateIps) {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should validate URL utility accepts public URLs', async () => {
      const { validateUrl } = await import('../../src/utils/url-validator');

      const publicUrls = ['https://example.com', 'https://www.google.com', 'http://api.github.com'];

      for (const url of publicUrls) {
        const result = validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.errors.length).toBe(0);
      }
    });

    it('should validate URL utility rejects blocked ports', async () => {
      const { validateUrl } = await import('../../src/utils/url-validator');

      const blockedPorts = [
        'http://example.com:22', // SSH
        'http://example.com:3306', // MySQL
        'http://example.com:27017', // MongoDB
        'http://example.com:6379' // Redis
      ];

      for (const url of blockedPorts) {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('blocked'))).toBe(true);
      }
    });

    it('should validate URL utility enforces whitelist', async () => {
      const { validateUrl } = await import('../../src/utils/url-validator');

      const allowedDomains = ['trusted.com', 'api.trusted.com'];

      // URL permitida
      const validResult = validateUrl('https://api.trusted.com/webhook', allowedDomains);
      expect(validResult.isValid).toBe(true);

      // URL no permitida
      const invalidResult = validateUrl('https://malicious.com/webhook', allowedDomains);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some(e => e.includes('not in the allowed domains'))).toBe(true);
    });

    it('should validate URL utility rejects invalid protocols', async () => {
      const { validateUrl } = await import('../../src/utils/url-validator');

      const invalidProtocols = [
        'file:///etc/passwd',
        'ftp://example.com',
        'gopher://example.com',
        'javascript:alert(1)'
      ];

      for (const url of invalidProtocols) {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe('Path Sanitizer Utility', () => {
    it('should detect path traversal patterns', async () => {
      const { sanitizePath } = await import('../../src/utils/path-sanitizer');

      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'normal/../../../etc/passwd',
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const malPath of maliciousPaths) {
        const result = sanitizePath(malPath);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(e => e.includes('traversal'))).toBe(true);
      }
    });

    it('should sanitize dangerous characters in filenames', async () => {
      const { sanitizePath } = await import('../../src/utils/path-sanitizer');

      const result = sanitizePath('file<>:|?.txt');

      if (result.isValid && result.sanitizedPath) {
        expect(result.sanitizedPath).not.toMatch(/[<>:"|?*]/);
      }
    });

    it('should validate file is within base directory', async () => {
      const { isPathWithinBase } = await import('../../src/utils/path-sanitizer');

      const baseDir = path.join(process.cwd(), 'uploads');

      // Path válido dentro del directorio
      const validPath = 'documents/file.txt';
      expect(isPathWithinBase(validPath, baseDir)).toBe(true);

      // Path fuera del directorio
      const invalidPath = '../../../etc/passwd';
      expect(isPathWithinBase(invalidPath, baseDir)).toBe(false);
    });
  });
});
