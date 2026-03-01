import { request, app } from '../setup';
import type { Response } from 'supertest';
import { registerAndLogin, getAuthCookie } from '../helpers/auth.helper';
import DocumentModel from '../../src/models/document.model';
import mongoose from 'mongoose';
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
type ApiBody = { success?: boolean; data?: unknown };

function bodyOf(res: Response): ApiBody {
  return (res.body as unknown) as ApiBody;
}

describeOrSkip('AI Endpoints', () => {
  let authCookies: string[];
  let organizationId: string;
  let userId: string;
  let documentId: string;

  beforeAll(() => {
    // Force AI provider to mock for tests
    process.env.AI_PROVIDER = 'mock';
  });

  afterAll(() => {
    delete process.env.AI_PROVIDER;
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

    const createdUnknown = await createDocumentModel(DocumentModel, {
      organization: organizationId,
      filename: 'test-ai-doc.txt',
      content: testContent,
      mimeType: 'text/plain',
      uploadedBy: new mongoose.Types.ObjectId(userId),
      folder: rootFolderId
    });

    // Validate result shape without using `any` (use unknown + type guards)
    if (typeof createdUnknown !== 'object' || createdUnknown === null || !('_id' in createdUnknown)) {
      throw new Error('createDocumentModel returned unexpected value');
    }
    const createdIdRaw = (createdUnknown as { _id?: unknown })._id;
    if (createdIdRaw === undefined || createdIdRaw === null || typeof (createdIdRaw as { toString?: unknown }).toString !== 'function') {
      throw new Error('created document _id is missing or not stringable');
    }
    documentId = (createdIdRaw as { toString: () => string }).toString();
  });

  afterEach(() => {
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

  describe('GET /api/ai/documents/:documentId/extract-text', (): void => {
    it('should extract text from a text document', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .get(`/api/ai/documents/${documentId}/extract-text`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      const data = b.data as Record<string, unknown>;
      expect(data).toBeDefined();
      const text = data['text'] as string;
      expect(text).toBeDefined();
      expect(text).toContain('documento de prueba');
      const charCount = data['charCount'] as number;
      expect(charCount).toBeGreaterThan(0);
      const wordCount = data['wordCount'] as number;
      expect(wordCount).toBeGreaterThan(0);
      expect(data['mimeType']).toBe('text/plain');
    });

    it('should fail with invalid document ID', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .get('/api/ai/documents/invalid-id/extract-text')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).get(`/api/ai/documents/${documentId}/extract-text`);
      expect(res.status).toBe(401);
    });

    it('should fail for non-existent document', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/ai/documents/${fakeId}/extract-text`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(404);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });
  });

  describe('POST /api/ai/documents/:documentId/process', (): void => {
    it('should process a document with text content', async (): Promise<void> => {
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
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      const data = b.data as Record<string, unknown>;
      expect(data).toBeDefined();
      expect(data['documentId']).toBe(documentId);
      const chunksCreated = data['chunksCreated'] as number;
      expect(chunksCreated).toBeGreaterThanOrEqual(1);
      expect(data['dimensions']).toBe(1536);
    }, 30000); // Timeout extendido para llamadas a OpenAI

    it('should fail without text content', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({});

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail with empty text', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: '' });

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .send({ text: 'test content' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/ai/documents/:documentId/chunks', (): void => {
    beforeEach(async () => {
      // Primero procesar el documento para tener chunks que eliminar
      const cookieHeader = getAuthCookie(authCookies);
      const textContent = 'Contenido de prueba para eliminar chunks.';

      await request(app)
        .post(`/api/ai/documents/${documentId}/process`)
        .set('Cookie', cookieHeader)
        .send({ text: textContent });
    }, 30000);

    it('should delete document chunks', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .delete(`/api/ai/documents/${documentId}/chunks`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      const data = b.data as Record<string, unknown>;
      expect(data).toBeDefined();
      const deletedCount = data['deletedCount'] as number;
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should fail with invalid document ID', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .delete('/api/ai/documents/invalid-id/chunks')
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).delete(`/api/ai/documents/${documentId}/chunks`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/ask', (): void => {
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

    it('should answer a question using RAG', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app).post('/api/ai/ask').set('Cookie', cookieHeader).send({
        question: '¿Cuáles son los objetivos del Q1 2026?',
        organizationId: organizationId
      });

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      const data = b.data as Record<string, unknown>;
      expect(data).toBeDefined();
      const answer = data['answer'] as string;
      expect(answer).toBeDefined();
      expect(typeof answer).toBe('string');
      const sources = data['sources'] as unknown;
      expect(sources).toBeDefined();
      expect(Array.isArray(sources)).toBe(true);
    }, 30000);

    it('should fail without question', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/ask')
        .set('Cookie', cookieHeader)
        .send({ organizationId: organizationId });

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without organizationId', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/ask')
        .set('Cookie', cookieHeader)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app).post('/api/ai/ask').send({
        question: 'Test question?',
        organizationId: organizationId
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/documents/:documentId/ask', (): void => {
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

    it('should answer a question about a specific document', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .set('Cookie', cookieHeader)
        .send({ question: '¿De qué trata este documento?' });

      expect(res.status).toBe(200);
      const b = bodyOf(res);
      expect(b.success).toBe(true);
      const data = b.data as Record<string, unknown>;
      expect(data).toBeDefined();
      const answer = data['answer'] as string;
      expect(answer).toBeDefined();
      expect(typeof answer).toBe('string');
      const sources = data['sources'] as unknown[];
      expect(sources).toBeDefined();
      expect(sources).toContain(documentId);
    }, 30000);

    it('should fail without question', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .set('Cookie', cookieHeader)
        .send({});

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail with invalid document ID', async (): Promise<void> => {
      const cookieHeader = getAuthCookie(authCookies);

      const res = await request(app)
        .post('/api/ai/documents/invalid-id/ask')
        .set('Cookie', cookieHeader)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(400);
      const b = bodyOf(res);
      expect(b.success).toBe(false);
    });

    it('should fail without authentication', async (): Promise<void> => {
      const res = await request(app)
        .post(`/api/ai/documents/${documentId}/ask`)
        .send({ question: 'Test question?' });

      expect(res.status).toBe(401);
    });
  });
});
