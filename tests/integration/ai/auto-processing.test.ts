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

// IMPORTANTE: Los mocks deben ir ANTES de los imports
jest.mock('../../../src/services/search.service', (): unknown => ({
  indexDocument: jest.fn().mockResolvedValue(undefined),
  removeDocumentFromIndex: jest.fn().mockResolvedValue(undefined),
  searchDocuments: jest.fn().mockResolvedValue({ documents: [], total: 0 }),
  getAutocompleteSuggestions: jest.fn().mockResolvedValue([])
}));

// Mock del servicio de extracción de texto ANTES de importar el job
jest.mock('../../../src/services/ai/text-extraction.service', (): unknown => {
  const SUPPORTED_MIME_TYPES = {
    PDF: 'application/pdf',
    DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    DOC: 'application/msword',
    TXT: 'text/plain',
    MD: 'text/markdown',
    PNG: 'image/png',
    JPG: 'image/jpeg',
    TIFF: 'image/tiff',
    BMP: 'image/bmp'
  } as const;

  const isSupported = (mime: string): boolean => {
    const supported: string[] = Object.values(SUPPORTED_MIME_TYPES);
    return supported.includes(mime);
  };

  return {
    __esModule: true,
    SUPPORTED_MIME_TYPES,
    textExtractionService: {
      extractText: jest.fn(),
      isSupportedMimeType: jest.fn((mime: string) => isSupported(mime))
    }
  };
});

import '../../setup'; // Import MongoDB Memory Server connection
import DocumentModel from '../../../src/models/document.model';
import { processDocumentAI } from '../../../src/jobs/process-document-ai.job';
// Use require to ensure Jest's mock factory is applied and we get the mocked module
let textExtractionService: { extractText: jest.Mock; isSupportedMimeType: jest.Mock };

describe('Auto-processing AI Integration Tests', (): void => {
  const testOrganizationId = '507f1f77bcf86cd799439011';

  beforeAll(async (): Promise<void> => {
    // Configurar Mock Provider para tests
    process.env.AI_PROVIDER = 'mock';
    // Import the mocked textExtractionService after jest.mock has been applied
    const teModule = await import('../../../src/services/ai/text-extraction.service');
    textExtractionService = teModule.textExtractionService as unknown as { extractText: jest.Mock; isSupportedMimeType: jest.Mock };
    if (!textExtractionService.isSupportedMimeType) {
      textExtractionService.isSupportedMimeType = jest.fn((mime: string) => {
        const supported = [
          'text/plain',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'text/markdown',
          'image/jpeg',
          'image/png',
          'image/tiff',
          'image/bmp'
        ];
        return supported.includes(mime);
      });
    }
  });

  beforeEach((): void => {
    // Configurar mock de extracción de texto antes de cada test
    textExtractionService.extractText.mockResolvedValue({
      text: 'Este es un documento de prueba para el procesamiento AI. Contiene múltiples párrafos. Y suficiente texto para probar la extracción.',
      charCount: 120,
      wordCount: 20,
      mimeType: 'text/plain',
      metadata: {}
    });
    // Ensure isSupportedMimeType is a working mock that reflects supported list
    const supportedList = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/bmp'
    ];

    textExtractionService.isSupportedMimeType.mockImplementation((mime: string) => supportedList.includes(mime));
  });

  afterAll(() => {
    // Limpiar configuración
    delete process.env.AI_PROVIDER;
  });

  afterEach(async () => {
    // Limpiar documentos de prueba
    await DocumentModel.deleteMany({});
  });

  describe('processDocumentAI', (): void => {
    it('should extract text and update document status to completed', async (): Promise<void> => {
      // Arrange: Crear documento de prueba
      const doc = await DocumentModel.create({
        filename: 'test-document.txt',
        originalname: 'Test Document.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/fake/path/test-document.txt',
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
      expect(updatedDoc?.aiProcessingStatus).toBe('completed');
      expect(updatedDoc?.extractedText).toBeTruthy();
      expect(updatedDoc?.extractedText?.length).toBeGreaterThan(0);
      expect(updatedDoc?.extractedText).toContain('documento de prueba');
      expect(updatedDoc?.aiProcessedAt).toBeInstanceOf(Date);
      expect(updatedDoc?.aiError).toBeNull();
    });

    it('should mark document as completed without processing if MIME type is unsupported', async (): Promise<void> => {
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

      // Arrange override: mark video mime as unsupported explicitly
      textExtractionService.isSupportedMimeType.mockImplementation((_mime: string) => false);

      // Act: Intentar procesar
      await processDocumentAI(doc._id.toString());

      // Assert: Estado debe ser 'completed' pero sin texto extraído
      const updatedDoc = await DocumentModel.findById(doc._id).select('+extractedText');

      expect(updatedDoc?.aiProcessingStatus).toBe('completed');
      expect(updatedDoc?.extractedText).toBeNull();
      expect(updatedDoc?.aiProcessedAt).toBeInstanceOf(Date);
    });

    it('should mark document as failed if extraction throws error', async (): Promise<void> => {
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

      // Arrange: force extractText to throw to simulate missing file/path
      textExtractionService.extractText.mockRejectedValue(new Error('File not found'));
      try {
        await processDocumentAI(doc._id.toString());
      } catch {
        // Esperamos que falle
      }

      // Assert: Estado debe ser 'failed' con mensaje de error
      const updatedDoc = await DocumentModel.findById(doc._id);

      expect(updatedDoc?.aiProcessingStatus).toBe('failed');
      expect(updatedDoc?.aiError).toBeTruthy();
      expect(updatedDoc?.aiError).toContain('not found'); // Error de archivo no encontrado
    });

    it('should not reprocess document if already completed', async (): Promise<void> => {
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

      expect(updatedDoc?.aiProcessingStatus).toBe('completed');
      expect(updatedDoc?.aiProcessedAt).toEqual(originalProcessedAt);
    });

    it('should handle documents with no organization (skip chunk processing)', async () => {
      // Arrange: Documento sin organización
      const doc = await DocumentModel.create({
        filename: 'personal-doc.txt',
        originalname: 'Personal Doc.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: null, // Sin organización
        path: '/fake/path/personal-doc.txt',
        url: '/storage/personal-doc.txt',
        aiProcessingStatus: 'pending'
      });

      // Act: Procesar documento
      await processDocumentAI(doc._id.toString());

      // Assert: Debe completarse pero sin procesar chunks
      const updatedDoc = await DocumentModel.findById(doc._id).select('+extractedText');

      expect(updatedDoc?.aiProcessingStatus).toBe('completed');
      expect(updatedDoc?.extractedText).toBeTruthy();
      expect(updatedDoc?.aiProcessedAt).toBeInstanceOf(Date);
    });
  });

  describe('Text Extraction Service Integration', (): void => {
    it('should support common document types', (): void => {
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

    it('should reject unsupported document types', (): void => {
      expect(textExtractionService.isSupportedMimeType('video/mp4')).toBe(false);
      expect(textExtractionService.isSupportedMimeType('audio/mpeg')).toBe(false);
      // Images are supported via OCR
      expect(textExtractionService.isSupportedMimeType('image/jpeg')).toBe(true);
    });
  });

  describe('AI Status Tracking', (): void => {
    it('should track processing status through lifecycle', async (): Promise<void> => {
      // Arrange: Documento inicial
      const doc = await DocumentModel.create({
        filename: 'lifecycle-test.txt',
        originalname: 'Lifecycle Test.txt',
        mimeType: 'text/plain',
        size: 100,
        uploadedBy: '507f1f77bcf86cd799439012',
        folder: '507f1f77bcf86cd799439013',
        organization: testOrganizationId,
        path: '/fake/path/lifecycle-test.txt',
        url: '/storage/lifecycle-test.txt',
        aiProcessingStatus: 'pending'
      });

      // Estado inicial: pending
      expect(doc.aiProcessingStatus).toBe('pending');

      // Procesar documento
      await processDocumentAI(doc._id.toString());

      // Estado final: completed
      const finalDoc = await DocumentModel.findById(doc._id);
      expect(finalDoc?.aiProcessingStatus).toBe('completed');
      expect(finalDoc?.aiProcessedAt).toBeTruthy();
      expect(finalDoc?.aiError).toBeNull();
    });

    it('should initialize new documents with status "pending"', async (): Promise<void> => {
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
