import { request, app } from '../setup';
import { registerAndLogin, getAuthCookie } from '../helpers/auth.helper';
import DocumentModel from '../../src/models/document.model';
import User from '../../src/models/user.model';
import path from 'path';
import fs from 'fs';
import { createDocumentModel } from '../builders/document.builder';

// Integration AI tests - use global mocks from jest.setup.ts
const describeOrSkip = describe;

/**
 * Tests de integración para endpoints de IA
 * Prueba extracción de texto, procesamiento de documentos, y RAG
 *
 * NOTA: Estos tests requieren OPENAI_API_KEY y MONGODB_ATLAS_URI configurados.
 * Se saltarán automáticamente si no están disponibles.
 */
describeOrSkip('AI Endpoints', () => {
  let authCookies: string[];
  let organizationId: string;
  let userId: string;
  let documentId: string;

  beforeAll(() => {
    // Force LLM to use global OpenAI mock
    process.env.USE_OPENAI_GLOBAL_MOCK = 'true';
  });

  afterAll(() => {
    delete process.env.USE_OPENAI_GLOBAL_MOCK;
  });

  beforeEach(async () => {
    const auth = await registerAndLogin({
      name: 'AI Test User',
      email: `aitest-${Date.now()}@example.com`,
      password: 'Test@1234'
    });

    authCookies = auth.cookies;
    organizationId = auth.organizationId!;
    userId = auth.userId;

    // Crear un documento de prueba usando el builder (crea archivo en storage + registro en DB)
    const user = await User.findById(userId);
    const rootFolderId = user?.rootFolder?.toString();

    const testContent =
      'Este es un documento de prueba para testing de IA. Contiene información sobre proyectos y objetivos del Q1 2026.';

    const created = await createDocumentModel(DocumentModel, {
      organization: organizationId,
      filename: 'test-ai-doc.txt',
      content: testContent,
      mimeType: 'text/plain',
      uploadedBy: userId,
      folder: rootFolderId
    });

    documentId = created._id.toString();
  });

  afterEach(async () => {
    // Limpiar archivos de prueba
    const testFilePath = path.join(
      process.cwd(),
      'storage',
      organizationId?.toString() || 'test-org',
      'test-ai-doc.txt'
    );
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('GET /api/ai/documents/:documentId/extract-text', () => {
    it('should extract text from a text document', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .get(`/api/ai/documents/${documentId}/extract-text`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.text).toBeDefined();
      expect(res.body.data.text).toContain('documento de prueba');
      expect(res.body.data.charCount).toBeGreaterThan(0);
      expect(res.body.data.wordCount).toBeGreaterThan(0);
      expect(res.body.data.mimeType).toBe('text/plain');
    });

    it('should fail with invalid document ID', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .get('/api/ai/documents/invalid-id/extract-text')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app).get(`/api/ai/documents/${documentId}/extract-text`);

      expect(res.status).toBe(401);
    });

    it('should fail for non-existent document', async () => {
      const cookieHeader = getAuthCookie(authCookies);
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/ai/documents/${fakeId}/extract-text`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/ai/documents/:documentId/process', () => {
    it('should process a document with text content', async () => {
      const cookieHeader = getAuthCookie(authCookies);
      const textContent =
        'Este es el contenido del documento para procesar. ' +
        'Contiene información importante sobre el proyecto Q1 2026. ' +
        'Los objetivos principales son mejorar la productividad y aumentar las ventas.';

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: textContent });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.documentId).toBe(documentId);
      expect(res.body.data.chunksCreated).toBeGreaterThanOrEqual(1);
      expect(res.body.data.dimensions).toBe(1536);
    }, 30000); // Timeout extendido para llamadas a OpenAI

    it('should fail without text content', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with empty text', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .send({ text: 'test content' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/ai/documents/:documentId/chunks', () => {
    beforeEach(async () => {
      // Primero procesar el documento para tener chunks que eliminar
      const cookieHeader = getAuthCookie(authCookies);
      const textContent = 'Contenido de prueba para eliminar chunks.';

      await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: textContent });
    }, 30000);

    it('should delete document chunks', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .delete(`/api/ai/documents/${documentId}/chunks`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should fail with invalid document ID', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .delete('/api/ai/documents/invalid-id/chunks')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app).delete(`/api/ai/documents/${documentId}/chunks`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/ask', () => {
    beforeEach(async () => {
      // Procesar documento primero para tener contenido buscable
      const cookieHeader = getAuthCookie(authCookies);
      const textContent =
        'Los objetivos del Q1 2026 incluyen aumentar las ventas en un 20% y mejorar la satisfacción del cliente.';

      await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: textContent });
    }, 30000);

    it('should answer a question using RAG', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app).post('/api/ai/ask').set('Cookie', cookieHeader).send({
        question: '¿Cuáles son los objetivos del Q1 2026?',
        organizationId: organizationId
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.answer).toBeDefined();
      expect(typeof res.body.data.answer).toBe('string');
      expect(res.body.data.sources).toBeDefined();
      expect(Array.isArray(res.body.data.sources)).toBe(true);
    }, 30000);

    it('should fail without question', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/ask')
        .set('Cookie', cookieHeader)
        .send({ organizationId: organizationId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without organizationId', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/ask')
        .set('Cookie', cookieHeader)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app).post('/api/ai/ask').send({
        question: 'Test question?',
        organizationId: organizationId
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/documents/:documentId/ask', () => {
    beforeEach(async () => {
      // Procesar documento primero
      const cookieHeader = getAuthCookie(authCookies);
      const textContent =
        'Este documento trata sobre la implementación de nuevas funcionalidades de IA en el sistema CloudDocs.';

      await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: textContent });
    }, 30000);

    it('should answer a question about a specific document', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .set('Cookie', cookieHeader)
        .send({ question: '¿De qué trata este documento?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.answer).toBeDefined();
      expect(typeof res.body.data.answer).toBe('string');
      expect(res.body.data.sources).toBeDefined();
      expect(res.body.data.sources).toContain(documentId);
    }, 30000);

    it('should fail without question', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .set('Cookie', cookieHeader)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid document ID', async () => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/documents/invalid-id/ask')
        .set('Cookie', cookieHeader)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(401);
    });
  });
});
