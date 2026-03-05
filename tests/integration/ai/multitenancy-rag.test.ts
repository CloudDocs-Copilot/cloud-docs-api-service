/**
 * Tests de Seguridad Multitenancy para RAG (RFE-AI-005)
 *
 * NOTA IMPORTANTE: Estos son tests unitarios que verifican la presencia de
 * organizationId en chunks y validaciones de parámetros.
 *
 * Los tests de búsqueda vectorial con $vectorSearch NO pueden ejecutarse contra
 * mongodb-memory-server porque este operador es específico de MongoDB Atlas.
 * La validación completa de seguridad cross-org requiere tests de integración
 * contra una instancia real de Atlas con índices vectoriales configurados.
 *
 * Lo que estos tests SÍ verifican:
 * ✅ Los chunks se crean con organizationId
 * ✅ Los métodos de RAG requieren organizationId (validación de parámetros)
 * ✅ La estructura de datos incluye organizationId en todos los puntos
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { closeAtlasConnection } from '../../../src/configurations/database-config/mongoAtlas';
import { DocumentProcessor } from '../../../src/services/document-processor.service';
import { RAGService } from '../../../src/services/ai/rag.service';
import DocumentModel from '../../../src/models/document.model';
import Organization from '../../../src/models/organization.model';
import User from '../../../src/models/user.model';
import Folder from '../../../src/models/folder.model';
import { resetAIProvider } from '../../../src/services/ai/providers';

describe('RAG Multitenancy Security (RFE-AI-005) - Unit Tests', () => {
  let mongoServer: MongoMemoryServer;
  let documentProcessor: DocumentProcessor;
  let ragService: RAGService;

  // IDs de organizaciones y documentos para las pruebas
  let org1Id: string;
  let org2Id: string;
  let user1Id: string;
  let user2Id: string;
  let folder1Id: string;
  let doc1Id: string;
  let doc2Id: string;

  beforeAll(async () => {
    // Configurar MockProvider para tests rápidos y determinísticos
    process.env.AI_PROVIDER = 'mock';
    resetAIProvider();

    // Conectar a MongoDB (in-memory) - usaremos la misma instancia para local y "Atlas"
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Usar el mismo URI para "Atlas" (en tests unitarios no hacemos búsquedas vectoriales reales)
    process.env.MONGO_ATLAS_URI = mongoUri;

    // Inicializar servicios
    documentProcessor = new DocumentProcessor();
    ragService = new RAGService();

    // Setup: Crear organizaciones y documentos
    const user1 = await User.create({
      name: 'User Org 1',
      email: 'user1@org1.com',
      password: 'password123'
    });
    user1Id = user1._id.toString();

    const user2 = await User.create({
      name: 'User Org 2',
      email: 'user2@org2.com',
      password: 'password123'
    });
    user2Id = user2._id.toString();

    const org1 = await Organization.create({
      name: 'Organization 1',
      owner: user1Id
    });
    org1Id = org1._id.toString();

    const org2 = await Organization.create({
      name: 'Organization 2',
      owner: user2Id
    });
    org2Id = org2._id.toString();

    const folder1 = await Folder.create({
      name: 'Folder Org 1',
      type: 'folder',
      owner: user1Id,
      organization: org1Id,
      parent: null,
      isRoot: true,
      path: '/org1'
    });
    folder1Id = folder1._id.toString();

    // Crear documentos
    const doc1 = await DocumentModel.create({
      filename: 'secret-org1.txt',
      originalname: 'Secret Org 1.txt',
      uploadedBy: user1Id,
      organization: org1Id,
      folder: folder1Id,
      path: '/org1/secret-org1.txt',
      size: 1000,
      mimeType: 'text/plain'
    });
    doc1Id = doc1._id.toString();

    const doc2 = await DocumentModel.create({
      filename: 'secret-org2.txt',
      originalname: 'Secret Org 2.txt',
      uploadedBy: user2Id,
      organization: org2Id,
      folder: folder1Id,
      path: '/org2/secret-org2.txt',
      size: 1000,
      mimeType: 'text/plain'
    });
    doc2Id = doc2._id.toString();

    // Procesar documentos con contenido diferente
    await documentProcessor.processDocument(
      doc1Id,
      org1Id,
      'This is confidential information from Organization 1. Secret project Alpha.'
    );

    await documentProcessor.processDocument(
      doc2Id,
      org2Id,
      'This is confidential information from Organization 2. Secret project Beta.'
    );
  });

  afterAll(async () => {
    await closeAtlasConnection();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('🔐 Data Integrity - organizationId in Chunks', (): void => {
    it('should include organizationId in all chunks created for org1', async (): Promise<void> => {
      const org1Chunks = await documentProcessor.getDocumentChunks(doc1Id);

      expect(org1Chunks.length).toBeGreaterThan(0);

      org1Chunks.forEach(chunk => {
        expect(chunk.organizationId).toBe(org1Id);
        expect(chunk.documentId).toBe(doc1Id);
        expect(chunk.content).toBeDefined();
        expect(chunk.embedding).toBeDefined();
      });
    });

    it('should include organizationId in all chunks created for org2', async (): Promise<void> => {
      const org2Chunks = await documentProcessor.getDocumentChunks(doc2Id);

      expect(org2Chunks.length).toBeGreaterThan(0);

      org2Chunks.forEach(chunk => {
        expect(chunk.organizationId).toBe(org2Id);
        expect(chunk.documentId).toBe(doc2Id);
        expect(chunk.content).toBeDefined();
        expect(chunk.embedding).toBeDefined();
      });
    });

    it('should have organizationId in ALL chunks across all documents', async (): Promise<void> => {
      const org1Chunks = await documentProcessor.getDocumentChunks(doc1Id);
      const org2Chunks = await documentProcessor.getDocumentChunks(doc2Id);
      const allChunks = [...org1Chunks, ...org2Chunks];

      expect(allChunks.length).toBeGreaterThan(0);

      allChunks.forEach(chunk => {
        expect(chunk.organizationId).toBeDefined();
        expect(chunk.organizationId).not.toBeNull();
        expect(typeof chunk.organizationId).toBe('string');
        expect(chunk.organizationId.length).toBeGreaterThan(0);
      });
    });
  });

  describe('🔐 Parameter Validation - organizationId Required', (): void => {
    it('should reject search() without organizationId', async () => {
      await expect(ragService.search('test query', '', 5)).rejects.toThrow(
        'El ID de la organización es obligatorio'
      );
    });

    it('should reject search() with whitespace-only organizationId', async () => {
      await expect(ragService.search('test query', '   ', 5)).rejects.toThrow(
        'El ID de la organización es obligatorio'
      );
    });

    it('should reject searchInDocument() without organizationId', async () => {
      await expect(ragService.searchInDocument('test query', '', doc1Id, 5)).rejects.toThrow(
        'El ID de la organización es obligatorio'
      );
    });

    it('should reject answerQuestion() without proper parameters', async () => {
      // Empty question
      await expect(ragService.answerQuestion('', org1Id, 5)).rejects.toThrow(
        'La pregunta no puede estar vacía'
      );

      // Whitespace-only question
      await expect(ragService.answerQuestion('   ', org1Id, 5)).rejects.toThrow(
        'La pregunta no puede estar vacía'
      );
    });

    it('should reject answerQuestionInDocument() without organizationId', async () => {
      await expect(ragService.answerQuestionInDocument('test', '', doc1Id, 5)).rejects.toThrow(
        'El ID de la organización es obligatorio'
      );
    });
  });

  describe('🔐 Document Processor - organizationId Handling', (): void => {
    it('should reject processDocument() without organizationId', async () => {
      const testDoc = await DocumentModel.create({
        filename: 'test-no-org.txt',
        originalname: 'Test No Org.txt',
        uploadedBy: user1Id,
        organization: org1Id,
        folder: folder1Id,
        path: '/test/test-no-org.txt',
        size: 100,
        mimeType: 'text/plain'
      });

      await expect(
        documentProcessor.processDocument(testDoc._id.toString(), '', 'Some text')
      ).rejects.toThrow('ID de organización es requerido');
    });

    it('should create chunks with correct organizationId', async (): Promise<void> => {
      const testDoc = await DocumentModel.create({
        filename: 'test-with-org.txt',
        originalname: 'Test With Org.txt',
        uploadedBy: user1Id,
        organization: org1Id,
        folder: folder1Id,
        path: '/test/test-with-org.txt',
        size: 200,
        mimeType: 'text/plain'
      });

      const result = await documentProcessor.processDocument(
        testDoc._id.toString(),
        org1Id,
        'This is a test document with some content to chunk. It should have multiple sentences.'
      );

      expect(result.chunksCreated).toBeGreaterThan(0);

      // Verificar que los chunks creados tienen organizationId
      const chunks = await documentProcessor.getDocumentChunks(testDoc._id.toString());

      expect(chunks.length).toBe(result.chunksCreated);

      chunks.forEach(chunk => {
        expect(chunk.organizationId).toBe(org1Id);
        expect(chunk.documentId).toBe(testDoc._id.toString());
      });
    });
  });

  describe('📝 Documentation - Vector Search Integration Tests', (): void => {
    it('should document that $vectorSearch tests require real Atlas', (): void => {
      /**
       * NOTA PARA DESARROLLADORES:
       *
       * Los siguientes escenarios de seguridad cross-org requieren tests de integración
       * contra una instancia REAL de MongoDB Atlas con índices vectoriales configurados:
       *
       * 1. ❌ Búsquedas vectoriales NO deben retornar chunks de otras organizaciones
       * 2. ❌ searchInDocument() debe filtrar por organizationId
       * 3. ❌ answerQuestion() debe usar solo chunks de la org correcta
       * 4. ❌ answerQuestionInDocument() debe validar org ownership
       *
       * RAZÓN: mongodb-memory-server NO soporta el operador $vectorSearch que es
       * específico de MongoDB Atlas.
       *
       * SOLUCIÓN: Los tests unitarios actuales verifican que:
       * ✅ Los chunks se crean con organizationId
       * ✅ Los métodos validan organizationId (rechazan valores vacíos)
       * ✅ La estructura de datos es correcta
       *
       * Para tests de integración completos:
       * - Configure una instancia de Atlas de test
       * - Cree índices vectoriales en la colección document_chunks
       * - Ejecute los tests contra esa instancia
       *
       * Ver: docs/TEST-CONFIGURATION.md para más detalles
       */

      expect(true).toBe(true); // Test placeholder
    });
  });
});
