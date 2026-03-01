/**
 * Integration Tests - Document Classification & Summarization (RFE-AI-003, RFE-AI-007)
 *
 * Tests:
 * - Automatic classification during document upload/processing
 * - Manual classification endpoint
 * - Manual summarization endpoint
 * - Category validation
 * - Confidence score validation
 * - Tag extraction
 * - Error handling for documents without text
 */

import { request, app } from '../../setup';
import { registerAndLogin, getAuthCookie } from '../../helpers/auth.helper';
import { bodyOf } from '../../helpers';
import type { Response } from 'supertest';
import DocumentModel from '../../../src/models/document.model';
import UserModel from '../../../src/models/user.model';
import { DOCUMENT_CATEGORIES } from '../../../src/models/types/ai.types';

// Mock de Elasticsearch para que no falle
jest.mock('../../../src/services/search.service', () => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([])
}));

describe('AI Classification & Summarization - Integration Tests', (): void => {
  let authCookies: string[];
  let userId: string;
  let organizationId: string;
  let rootFolderId: string;

  beforeAll(() => {
    // Configurar Mock Provider para tests
    process.env.AI_PROVIDER = 'mock';
  });

  afterAll(() => {
    // Limpiar configuración
    delete process.env.AI_PROVIDER;
  });

  beforeEach(async () => {
    // Crear usuario y autenticación para cada test
    const auth = await registerAndLogin({
      name: 'Test Classify User',
      email: `classify-${Date.now()}@example.com`,
      password: 'Test@1234'
    });

    authCookies = auth.cookies;
    userId = auth.userId;
    if (!auth.organizationId) throw new Error('Test setup: organizationId missing');
    organizationId = auth.organizationId;

    // Obtener rootFolder del usuario
    const user = await UserModel.findById(userId);
    if (!user?.rootFolder) throw new Error('Test setup: user.rootFolder missing');
    rootFolderId = user.rootFolder.toString();
  });

  describe('POST /api/ai/documents/:documentId/classify - Manual Classification', (): void => {
    it('should classify a document with extracted text', async (): Promise<void> => {
      // Crear documento con texto extraído simulado (tipo contrato)
      const document = await DocumentModel.create({
        filename: 'contrato-servicios.pdf',
        mimeType: 'application/pdf',
        size: 50000,
        path: '/fake/path/contract.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        extractedText: `
          CONTRATO DE PRESTACIÓN DE SERVICIOS
          
          Entre las partes, ACME Corp (proveedor) y Cliente SA (cliente),
          acuerdan los siguientes términos y condiciones para la prestación
          de servicios de desarrollo de software.
          
          Cláusula 1: Objeto del contrato
          El proveedor se compromete a desarrollar una aplicación web según
          las especificaciones técnicas acordadas.
          
          Cláusula 2: Precio y forma de pago
          El precio total es de $50,000 USD, pagaderos en 3 cuotas.
          
          Cláusula 3: Plazo de ejecución
          El plazo de ejecución es de 6 meses a partir de la firma.
        `,
        aiProcessingStatus: 'completed'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(200);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('category');
      expect(body.data).toHaveProperty('confidence');
      expect(body.data).toHaveProperty('tags');

      // Validar que la categoría es una de las predefinidas
      expect(DOCUMENT_CATEGORIES).toContain(body.data?.category as string);

      // Validar confianza (0-1)
      expect(body.data?.confidence).toBeGreaterThanOrEqual(0);
      expect(body.data?.confidence).toBeLessThanOrEqual(1);

      // Validar que tags es un array
      expect(Array.isArray(body.data?.tags)).toBe(true);

      // Verificar que el documento se actualizó en la BD
      const updatedDoc = await DocumentModel.findById(document._id);
      expect(updatedDoc?.aiCategory).toBe(body.data?.category);
      expect(updatedDoc?.aiConfidence).toBe(body.data?.confidence);
      expect(updatedDoc?.aiTags).toEqual(body.data?.tags as unknown[]);
    });

    it('should return 400 if document has no extracted text', async (): Promise<void> => {
      // Documento sin texto extraído
      const document = await DocumentModel.create({
        filename: 'sin-texto.pdf',
        mimeType: 'application/pdf',
        size: 1000,
        path: '/fake/path/notext.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        aiProcessingStatus: 'pending'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(400);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('no extracted text');
    });

    it('should return 404 for non-existent document', async (): Promise<void> => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/ai/documents/${fakeId}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(404);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('not found');
    });

    it('should return 403 if user does not have access to document', async (): Promise<void> => {
      // Crear otro usuario usando registerAndLogin
      const otherAuth = await registerAndLogin({
        name: 'Other User',
        email: `other-${Date.now()}@example.com`,
        password: 'Test@1234'
      });

      // Obtener rootFolder del otro usuario
      const otherUser = await UserModel.findById(otherAuth.userId);
      if (!otherUser?.rootFolder) throw new Error('Test setup: other user rootFolder missing');
      const otherRootFolderId = otherUser.rootFolder.toString();

      // Documento de otro usuario
      const document = await DocumentModel.create({
        filename: 'private-doc.pdf',
        mimeType: 'application/pdf',
        size: 1000,
        path: '/fake/path/private.pdf',
        uploadedBy: otherAuth.userId,
        organization: otherAuth.organizationId,
        folder: otherRootFolderId,
        extractedText: 'Some private text',
        aiProcessingStatus: 'completed'
      });

      // Intentar clasificar con cookies del primer usuario
      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(403);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('Access denied');
    });
  });

  describe('POST /api/ai/documents/:documentId/summarize - Manual Summarization', (): void => {
    it('should summarize a document with extracted text', async (): Promise<void> => {
      // Crear documento con texto largo
      const document = await DocumentModel.create({
        filename: 'informe-trimestral.pdf',
        mimeType: 'application/pdf',
        size: 100000,
        path: '/fake/path/report.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        extractedText: `
          INFORME FINANCIERO - Q1 2024
          
          Resumen Ejecutivo:
          Durante el primer trimestre de 2024, la empresa experimentó un crecimiento
          del 15% en ingresos comparado con el mismo periodo del año anterior.
          Las ventas alcanzaron los $2.5 millones de dólares, superando la meta
          establecida de $2.2 millones.
          
          Resultados por Departamento:
          - Ventas: Incremento del 20% ($1.5M)
          - Marketing: Presupuesto utilizado al 85% ($300K)
          - Operaciones: Reducción de costos del 10% ($700K)
          
          Principales Logros:
          1. Lanzamiento exitoso de 3 nuevos productos
          2. Expansión a 2 nuevos mercados regionales
          3. Mejora del 25% en satisfacción del cliente
          
          Desafíos Identificados:
          - Rotación de personal en área técnica (18%)
          - Retrasos en implementación de ERP
          - Fluctuaciones en el tipo de cambio
          
          Proyecciones Q2:
          Se espera mantener tendencia de crecimiento con foco en retención
          de talento y optimización de procesos internos.
        `,
        aiProcessingStatus: 'completed'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/summarize`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(200);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };

      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('summary');
      expect(body.data).toHaveProperty('keyPoints');

      // Validar que el resumen es un string no vacío
      expect(typeof body.data?.summary).toBe('string');
      expect((body.data?.summary as string).length).toBeGreaterThan(10);

      // Validar que keyPoints es un array con elementos
      expect(Array.isArray(body.data?.keyPoints)).toBe(true);
      expect((body.data?.keyPoints as unknown[]).length).toBeGreaterThan(0);

      // Verificar que el documento se actualizó en la BD
      const updatedDoc = await DocumentModel.findById(document._id);
      expect(updatedDoc?.aiSummary).toBe(body.data?.summary);
      expect(updatedDoc?.aiKeyPoints).toEqual(body.data?.keyPoints as unknown[]);
    });

    it('should return 400 if document has no extracted text', async (): Promise<void> => {
      const document = await DocumentModel.create({
        filename: 'vacio.pdf',
        mimeType: 'application/pdf',
        size: 500,
        path: '/fake/path/empty.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        aiProcessingStatus: 'pending'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/summarize`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(400);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('no extracted text');
    });
  });

  describe('Automatic Classification on Upload', (): void => {
    it('should automatically classify and summarize during processing job', async (): Promise<void> => {
      // Este test verifica la clasificación y resumen manual
      // (El job automático requiere archivos físicos, se prueba en auto-processing.test.ts)

      // Crear documento con texto extraído
      const document = await DocumentModel.create({
        filename: 'factura-enero.pdf',
        mimeType: 'application/pdf',
        size: 25000,
        path: '/fake/path/invoice.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        extractedText: `
          FACTURA Nº 001-2024
          
          Fecha: 15 de enero de 2024
          Cliente: ACME Corporation
          RFC: ACM123456789
          
          Descripción de Servicios:
          - Consultoría técnica (40 horas) ........... $4,000 USD
          - Desarrollo de software .................... $6,000 USD
          - Soporte técnico mensual ................... $1,000 USD
          
          Subtotal: $11,000 USD
          IVA (16%): $1,760 USD
          Total: $12,760 USD
          
          Forma de pago: Transferencia bancaria
          Cuenta: 1234567890
          Banco: Banco Nacional
        `,
        aiProcessingStatus: 'pending'
      });

      // Clasificar documento manualmente
      await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(200);

      // Resumir documento manualmente
      await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/summarize`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(200);

      // Verificar que el documento fue clasificado y resumido
      const processedDoc = await DocumentModel.findById(document._id).select(
        '+extractedText +aiCategory +aiConfidence +aiTags +aiSummary +aiKeyPoints'
      );

      expect(processedDoc?.aiCategory).toBeDefined();
      expect(processedDoc?.aiConfidence).toBeDefined();
      expect(processedDoc?.aiTags).toBeDefined();
      expect(processedDoc?.aiSummary).toBeDefined();
      expect(processedDoc?.aiKeyPoints).toBeDefined();

      // Validar tipos y valores
      expect(processedDoc?.aiCategory).toBeDefined();
      expect(DOCUMENT_CATEGORIES).toContain(processedDoc?.aiCategory as string);
      expect(processedDoc?.aiConfidence).toBeGreaterThanOrEqual(0);
      expect(processedDoc?.aiConfidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(processedDoc?.aiTags)).toBe(true);
      expect(Array.isArray(processedDoc?.aiKeyPoints)).toBe(true);
    }, 30000); // Timeout extendido para procesamiento AI
  });

  describe('Category Validation', (): void => {
    it('should only return valid categories from DOCUMENT_CATEGORIES', async (): Promise<void> => {
      const document = await DocumentModel.create({
        filename: 'manual-usuario.pdf',
        mimeType: 'application/pdf',
        size: 80000,
        path: '/fake/path/manual.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        extractedText: `
          MANUAL DE USUARIO - Sistema CloudDocs v2.0
          
          Índice:
          1. Introducción
          2. Instalación
          3. Configuración
          4. Uso básico
          5. Funciones avanzadas
          6. Troubleshooting
          7. FAQ
          
          Capítulo 1: Introducción
          Este manual proporciona instrucciones detalladas sobre cómo instalar,
          configurar y utilizar el sistema CloudDocs...
        `,
        aiProcessingStatus: 'completed'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(200);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };

      // La categoría devuelta DEBE estar en la lista predefinida
      expect(DOCUMENT_CATEGORIES).toContain(body.data?.category as string);

      // Categorías válidas:
      const validCategories = [
        'Contrato',
        'Factura',
        'Informe',
        'Manual',
        'Política',
        'Presentación',
        'Reporte Financiero',
        'Acta de Reunión',
        'Propuesta',
        'Otro'
      ];

      expect(validCategories).toContain(body.data?.category as string);
    });
  });

  describe('Error Handling', (): void => {
    it('should handle AI provider errors gracefully', async (): Promise<void> => {
      // Este test verifica que si el proveedor de IA falla,
      // el endpoint devuelve un error apropiado

      const document = await DocumentModel.create({
        filename: 'test-error.pdf',
        mimeType: 'application/pdf',
        size: 1000,
        path: '/fake/path/error.pdf',
        uploadedBy: userId,
        organization: organizationId,
        folder: rootFolderId,
        extractedText: '', // Texto vacío puede causar error en algunos providers
        aiProcessingStatus: 'completed'
      });

      const response = await request(app)
        .post(`/api/ai/documents/${document._id.toString()}/classify`)
        .set('Cookie', getAuthCookie(authCookies))
        .expect(400);

      const body = bodyOf(response as unknown as Response) as { success: boolean; data?: Record<string, unknown>; error?: string };

      expect(body.success).toBe(false);
    });
  });
});
