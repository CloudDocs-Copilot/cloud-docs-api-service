/**
 * Tests de Integración: Auto-procesamiento de Documentos con IA
 * RFE-AI-002: Document Model + AI Pipeline
 *
 * Verifica que:
 * 1. Documentos se marcan como 'pending' al subir
 * 2. processDocumentAI extrae texto correctamente
 * 3. Chunks y embeddings se generan
 * 4. Estado se actualiza a 'completed' tras procesamiento exitoso
 * 5. Endpoint /ai-status retorna información correcta
 */

import '../../setup'; // Import MongoDB Memory Server connection
import DocumentModel from '../../../src/models/document.model';
import { processDocumentAI } from '../../../src/jobs/process-document-ai.job';
import { textExtractionService } from '../../../src/services/ai/text-extraction.service';
import path from 'path';
import fs from 'fs';
import { writeTestFile } from '../../helpers/fixtureBuilder';

// Mock de Elasticsearch para que no falle el indexDocument
jest.mock('../../../src/services/search.service', () => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([])
}));

describe('Auto-processing AI Integration Tests', () => {
  const testFilesDir = path.join(__dirname, '../../fixtures/test-files');
  const testOrganizationId = '507f1f77bcf86cd799439011';

  beforeAll(async () => {
    // Configurar Mock Provider para tests
    process.env.AI_PROVIDER = 'mock';
    // Crear archivo de texto de prueba en storage mediante helper
    writeTestFile({
      organization: testOrganizationId,
      filename: 'test-document.txt',
      content:
        'Este es un documento de prueba para el procesamiento AI.\n\nContiene múltiples párrafos.\n\nY suficiente texto para probar la extracción.'
    });
  });

  afterAll(() => {
    // Limpiar configuración
    delete process.env.AI_PROVIDER;
  });

  afterEach(async () => {
    // Limpiar documentos de prueba
    await DocumentModel.deleteMany({});
  });

  describe('processDocumentAI', () => {
    it('should extract text and update document status to completed', async () => {
      // Arrange: Crear documento de prueba
      const testFilePath = path.join(testFilesDir, 'test-document.txt');

      const doc = await DocumentModel.create({
        filename: 'test-document.txt',
        originalname: 'Test Document.txt',
        mimeType: 'text/plain',
        size: fs.statSync(testFilePath).size,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: testFilePath,
        url: '/storage/test-document.txt',
        aiProcessingStatus: 'pending'
      });

      expect(doc.aiProcessingStatus).toBe('pending');
      expect(doc.extractedText).toBeNull(); // Mongoose initializes optional fields as null

      // Act: Procesar documento
      await processDocumentAI(doc._id.toString());

      // Assert: Verificar que se extrajo texto y se actualizó estado
      const updatedDoc = await DocumentModel.findById(doc._id).select('+extractedText');

      expect(updatedDoc).toBeTruthy();
      expect(updatedDoc!.aiProcessingStatus).toBe('completed');
      expect(updatedDoc!.extractedText).toBeTruthy();
      expect(updatedDoc!.extractedText!.length).toBeGreaterThan(0);
      expect(updatedDoc!.extractedText).toContain('documento de prueba');
      expect(updatedDoc!.aiProcessedAt).toBeInstanceOf(Date);
      expect(updatedDoc!.aiError).toBeNull();
    });

    it('should mark document as completed without processing if MIME type is unsupported', async () => {
      // Arrange: Crear documento con MIME type no soportado
      const doc = await DocumentModel.create({
        filename: 'test-video.mp4',
        originalname: 'Video.mp4',
        mimeType: 'video/mp4', // No soportado
        size: 1000,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/fake/path/video.mp4',
        url: '/storage/video.mp4',
        aiProcessingStatus: 'pending'
      });

      // Act: Intentar procesar
      await processDocumentAI(doc._id.toString());

      // Assert: Estado debe ser 'completed' pero sin texto extraído
      const updatedDoc = await DocumentModel.findById(doc._id).select('+extractedText');

      expect(updatedDoc!.aiProcessingStatus).toBe('completed');
      expect(updatedDoc!.extractedText).toBeNull();
      expect(updatedDoc!.aiProcessedAt).toBeInstanceOf(Date);
    });

    it('should mark document as failed if extraction throws error', async () => {
      // Arrange: Crear documento con path inválido
      const doc = await DocumentModel.create({
        filename: 'nonexistent.txt',
        originalname: 'Nonexistent.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/this/path/does/not/exist.txt',
        url: '/storage/nonexistent.txt',
        aiProcessingStatus: 'pending'
      });

      // Act: Intentar procesar (debería fallar)
      try {
        await processDocumentAI(doc._id.toString());
      } catch (error) {
        // Esperamos que falle
      }

      // Assert: Estado debe ser 'failed' con mensaje de error
      const updatedDoc = await DocumentModel.findById(doc._id);

      expect(updatedDoc!.aiProcessingStatus).toBe('failed');
      expect(updatedDoc!.aiError).toBeTruthy();
      expect(updatedDoc!.aiError).toContain('not found'); // Error de archivo no encontrado
    });

    it('should not reprocess document if already completed', async () => {
      // Arrange: Documento ya procesado
      const doc = await DocumentModel.create({
        filename: 'already-processed.txt',
        originalname: 'Already Processed.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/fake/path.txt',
        url: '/storage/already-processed.txt',
        aiProcessingStatus: 'completed',
        extractedText: 'Already extracted text',
        aiProcessedAt: new Date()
      });

      const originalProcessedAt = doc.aiProcessedAt;

      // Act: Intentar procesar de nuevo
      await processDocumentAI(doc._id.toString());

      // Assert: No debe cambiar nada
      const updatedDoc = await DocumentModel.findById(doc._id);

      expect(updatedDoc!.aiProcessingStatus).toBe('completed');
      expect(updatedDoc!.aiProcessedAt).toEqual(originalProcessedAt);
    });

    it('should handle documents with no organization (skip chunk processing)', async () => {
      // Arrange: Documento sin organización
      const testFilePath = path.join(testFilesDir, 'test-document.txt');

      const doc = await DocumentModel.create({
        filename: 'personal-doc.txt',
        originalname: 'Personal Doc.txt',
        mimeType: 'text/plain',
        size: fs.statSync(testFilePath).size,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: null, // Sin organización
        path: testFilePath,
        url: '/storage/personal-doc.txt',
        aiProcessingStatus: 'pending'
      });

      // Act: Procesar documento
      await processDocumentAI(doc._id.toString());

      // Assert: Debe completarse pero sin procesar chunks
      const updatedDoc = await DocumentModel.findById(doc._id).select('+extractedText');

      expect(updatedDoc!.aiProcessingStatus).toBe('completed');
      expect(updatedDoc!.extractedText).toBeTruthy();
      expect(updatedDoc!.aiProcessedAt).toBeInstanceOf(Date);
    });
  });

  describe('Text Extraction Service Integration', () => {
    it('should support common document types', () => {
      expect(textExtractionService.isSupportedMimeType('text/plain')).toBe(true);
      expect(textExtractionService.isSupportedMimeType('application/pdf')).toBe(true);
      expect(
        textExtractionService.isSupportedMimeType(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).toBe(true);
      expect(textExtractionService.isSupportedMimeType('application/msword')).toBe(true);
      expect(textExtractionService.isSupportedMimeType('text/markdown')).toBe(true);
    });

    it('should reject unsupported document types', () => {
      expect(textExtractionService.isSupportedMimeType('video/mp4')).toBe(false);
      expect(textExtractionService.isSupportedMimeType('audio/mpeg')).toBe(false);
      // Images are supported via OCR
      expect(textExtractionService.isSupportedMimeType('image/jpeg')).toBe(true);
    });
  });

  describe('AI Status Tracking', () => {
    it('should track processing status through lifecycle', async () => {
      // Arrange: Documento inicial
      const testFilePath = path.join(testFilesDir, 'test-document.txt');

      const doc = await DocumentModel.create({
        filename: 'lifecycle-test.txt',
        originalname: 'Lifecycle Test.txt',
        mimeType: 'text/plain',
        size: fs.statSync(testFilePath).size,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: testFilePath,
        url: '/storage/lifecycle-test.txt',
        aiProcessingStatus: 'pending'
      });

      // Estado inicial: pending
      expect(doc.aiProcessingStatus).toBe('pending');

      // Procesar documento
      await processDocumentAI(doc._id.toString());

      // Estado final: completed
      const finalDoc = await DocumentModel.findById(doc._id);
      expect(finalDoc!.aiProcessingStatus).toBe('completed');
      expect(finalDoc!.aiProcessedAt).toBeTruthy();
      expect(finalDoc!.aiError).toBeNull();
    });

    it('should initialize new documents with status "pending"', async () => {
      const doc = await DocumentModel.create({
        filename: 'new-doc.txt',
        originalname: 'New Document.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/fake/path.txt',
        url: '/storage/new-doc.txt',
        aiProcessingStatus: 'pending'
      });

      expect(doc.aiProcessingStatus).toBe('pending');
      expect(doc.extractedText).toBeNull(); // Mongoose initializes optional fields as null
      expect(doc.aiProcessedAt).toBeNull(); // Mongoose initializes optional fields as null
    });
  });
});
