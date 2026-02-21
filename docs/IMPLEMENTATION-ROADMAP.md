# 🗺️ Roadmap de Implementación - Módulo IA CloudDocs

**Rama:** `ia-infraestructura-first-version`  
**Fecha Inicio:** Febrero 20, 2026  
**Estado:** 🚧 En Progreso

---

## 📋 Índice de Fases

- [Fase 0: Setup de Entornos](#-fase-0-setup-de-entornos) (2-3h) **← EMPEZAMOS AQUÍ**
- [Fase 1: Críticos - Seguridad y Abstracción](#-fase-1-críticos---seguridad-y-abstracción) (8-10h)
- [Fase 2: Alta - Auto-procesamiento](#-fase-2-alta-prioridad---auto-procesamiento) (6-8h)
- [Fase 3: Media - Clasificación e Indexación](#-fase-3-media-prioridad---clasificación-e-indexación) (10-12h)
- [Fase 4: Baja - OCR y Summarization](#-fase-4-baja-prioridad---ocr-y-summarization) (8-10h)

**Tiempo Total Estimado:** 34-43 horas

---

## 🎯 FASE 0: Setup de Entornos ✅ COMPLETADA

**Objetivo:** Habilitar Ollama (local/gratis) y MockAI antes de implementar abstracción

**Estado:** ✅ **COMPLETADA** (Febrero 20, 2026)

### Tareas Completadas

#### **✅ TASK 0.1: Instalar y Configurar Ollama** (1h)

**Completado:**

- ✅ Ollama 0.16.2 instalado correctamente
- ✅ Modelos descargados:
  - `llama3.2:3b` (2.0 GB) - LLM para chat
  - `nomic-embed-text` (274 MB) - Embeddings (768 dims)
- ✅ Servidor Ollama corriendo en `http://localhost:11434`
- ✅ NPM package `ollama` instalado

**Configuración en .env:**

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

---

#### **✅ TASK 0.2: Crear Estructura de Proveedores** (1h)

**Archivos creados:**

```schema
src/services/ai/providers/
├── ai-provider.interface.ts       # Interface base ✅
├── openai.provider.ts             # Implementación OpenAI ✅
├── ollama.provider.ts             # Implementación Ollama ✅
├── mock.provider.ts               # Implementación Mock ✅
├── provider.factory.ts            # Factory para seleccionar proveedor ✅
└── index.ts                       # Exports públicos ✅
```

**Características implementadas:**

- ✅ Interface `AIProvider` con métodos: `generateEmbedding()`, `generateResponse()`, `classifyDocument()`, `summarizeDocument()`, `checkConnection()`
- ✅ Tipos: `EmbeddingResult`, `ChatResult`, `GenerationOptions`, `ClassificationResult`, `SummarizationResult`
- ✅ Factory pattern con variable `AI_PROVIDER` (openai | ollama | mock)
- ✅ Taxonomía `DOCUMENT_CATEGORIES` en `ai.types.ts`

**Validación:**

```typescript
import { getAIProvider } from './providers';
const provider = getAIProvider();
console.log(provider.name); // 'ollama'
```

---

#### **✅ TASK 0.3: Test de Integración Ollama** (30min)

**Tests creados:**

- ✅ `tests/integration/ai/ai-provider.test.ts` (13 tests)
- ✅ `tests/integration/ai/ollama.provider.test.ts` (18 tests)

**Resultados:**

- ✅ **31/31 tests pasando** (100% success rate)
- ✅ Factory selecciona proveedor correcto
- ✅ MockProvider genera embeddings (1536 dims)
- ✅ OllamaProvider genera embeddings (768 dims)
- ✅ Generación de respuestas con llama3.2:3b
- ✅ Clasificación de documentos funcional
- ✅ Summarization funcional
- ✅ Manejo de errores robusto

**Tiempo de ejecución:** ~58 segundos para suite completa de Ollama

---

### ✅ Checklist Fase 0 - COMPLETADA

- [x] Ollama instalado y corriendo en `localhost:11434`
- [x] Modelos descargados: `llama3.2:3b` y `nomic-embed-text`
- [x] NPM package `ollama` instalado
- [x] Estructura de carpeta `providers/` creada
- [x] Interface `AIProvider` definida
- [x] `OllamaProvider` implementado y funcionando
- [x] `MockAIProvider` implementado
- [x] `OpenAIProvider` migrado (sin cambiar comportamiento)
- [x] `ProviderFactory` funcionando con `AI_PROVIDER` env var
- [x] Tests de integración pasando para Ollama
- [x] **.env unificado** con toda la configuración
- [x] **.env.example actualizado** con AI Provider config

---

### 📝 Configuración Unificada

**Archivo único:** Todo está en `.env` (y `.env.example` para referencia)

**Cambiar de proveedor:**

```bash
# Desarrollo local gratis con Ollama
AI_PROVIDER=ollama

# Producción con OpenAI (requiere API key)
AI_PROVIDER=openai

# Tests rápidos sin LLM real
AI_PROVIDER=mock
```

**No se requieren archivos adicionales** - `.env.local` fue eliminado.

---

## 🔴 FASE 1: Críticos - Seguridad y Abstracción

**Duración Estimada:** 8-10h  
**Issues:** RFE-AI-005 (cross-org leak) + RFE-AI-001 (abstracción)

---

### **RFE-AI-005: Arreglar Cross-Org Leak en RAG** (3-4h)

**Problema Actual:**  
La búsqueda vectorial en MongoDB Atlas (`rag.service.ts`) **NO filtra por `organizationId`**, permitiendo que usuarios de la Org A puedan obtener respuestas basadas en documentos de la Org B.

#### **TASK 1.1: Agregar `organizationId` a Chunks** (1h)

**Archivo:** `src/models/types/ai.types.ts`

```typescript
export interface IDocumentChunk {
  _id?: ObjectId;
  documentId: string;
  organizationId: string;  // 🆕 NUEVO CAMPO
  content: string;
  embedding: number[];
  createdAt: Date;
  chunkIndex: number;
  wordCount: number;
}
```

**Migración de Datos Existentes:**

Crear script: `scripts/migrate-add-org-to-chunks.ts`

```typescript
// Consultar todos los chunks
// Para cada chunk:
//   - Buscar documento en MongoDB local por documentId
//   - Actualizar chunk con organizationId del documento
```

**Ejecutar:**

```bash
npx ts-node scripts/migrate-add-org-to-chunks.ts
```

---

#### **TASK 1.2: Modificar `document-processor.service.ts`** (30min)

**Cambio:** Incluir `organizationId` al crear chunks

```typescript
async processDocument(
  documentId: string,
  organizationId: string,  // 🆕 NUEVO PARÁMETRO
  text: string
): Promise<IProcessingResult> {
  // ...
  const chunkDocuments: IDocumentChunk[] = chunks.map((content, index) => ({
    documentId,
    organizationId,  // 🆕 AGREGAR
    content,
    embedding: embeddings[index],
    // ...
  }));
}
```

---

#### **TASK 1.3: Modificar `rag.service.ts` - Filtro Obligatorio** (1h)

**Cambios en búsqueda vectorial:**

```typescript
async search(
  query: string,
  organizationId: string,  // 🆕 PARÁMETRO OBLIGATORIO
  topK: number = TOP_K_RESULTS
): Promise<ISearchResult[]> {
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  const results = await collection.aggregate([
    {
      $vectorSearch: {
        index: VECTOR_SEARCH_INDEX,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: topK * 10,
        limit: topK,
        filter: {  // 🆕 FILTRO POR ORGANIZACIÓN
          organizationId: { $eq: organizationId }
        }
      }
    },
    // ...
  ]).toArray();
}
```

**Aplicar a:**

- `search()`
- `searchInDocument()`
- `answerQuestion()`
- `answerQuestionInDocument()`

---

#### **TASK 1.4: Actualizar Controlador** (30min)

**Archivo:** `src/controllers/ai.controller.ts`

```typescript
export async function askQuestion(req, res, next) {
  const { question, organizationId } = req.body;
  
  // Validar membership (ya existe)
  const isActiveMember = await hasActiveMembership(req.user!.id, organizationId);
  
  // Pasar organizationId a RAG
  const response = await ragService.answerQuestion(
    question,
    organizationId  // 🆕 PASAR ORG ID
  );
}
```

---

#### **TASK 1.5: Tests de Seguridad Multitenancy** (1h)

**Crear:** `tests/integration/ai/multitenancy-rag.test.ts`

```typescript
describe('RAG Multitenancy Security', () => {
  it('should NOT return chunks from other organizations', async () => {
    // Crear 2 orgs
    const org1 = await OrganizationBuilder.create();
    const org2 = await OrganizationBuilder.create();
    
    // Documento en org1
    const doc1 = await DocumentBuilder.create({ organization: org1._id });
    await documentProcessor.processDocument(doc1._id, org1._id, 'Secret data org1');
    
    // Documento en org2
    const doc2 = await DocumentBuilder.create({ organization: org2._id });
    await documentProcessor.processDocument(doc2._id, org2._id, 'Secret data org2');
    
    // Buscar desde org1
    const results = await ragService.search('secret', org1._id.toString());
    
    // Verificar que SOLO retorna chunks de org1
    expect(results.every(r => r.chunk.organizationId === org1._id.toString())).toBe(true);
  });
});
```

---

### ✅ Checklist RFE-AI-005

- [ ] Campo `organizationId` agregado a `IDocumentChunk`
- [ ] Script de migración ejecutado
- [ ] `document-processor.service.ts` actualizado
- [ ] `rag.service.ts` con filtro `$eq organizationId`
- [ ] Todos los tests de seguridad pasando
- [ ] Verificado manualmente con 2 orgs diferentes

---

### **RFE-AI-001: Abstracción de AI Provider** (5-6h)

**Objetivo:** Refactorizar servicios para usar abstracción (ya creada en Fase 0)

#### **TASK 1.6: Migrar `embedding.service.ts` a usar Provider** (1.5h)

**Antes (actual):**

```typescript
class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    const openai = OpenAIClient.getInstance();
    const response = await openai.embeddings.create({ ... });
    return response.data[0].embedding;
  }
}
```

**Después:**

```typescript
class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    const provider = getAIProvider();  // 🆕 Usa factory
    const result = await provider.generateEmbedding(text);
    return result.embedding;
  }
}
```

**Testing:**

```bash
# Test con OpenAI
AI_PROVIDER=openai npm test -- embedding.service.test.ts

# Test con Ollama
AI_PROVIDER=ollama npm test -- embedding.service.test.ts

# Test con Mock (rápido)
AI_PROVIDER=mock npm test -- embedding.service.test.ts
```

---

#### **TASK 1.7: Migrar `llm.service.ts` a usar Provider** (1.5h)

**Cambios similares:**

- Eliminar `require('../../configurations/openai-config')`
- Usar `getAIProvider().generateResponse()`
- Eliminar hack de `(global as any).__OPENAI_CREATE__`

---

#### **TASK 1.8: Manejo de Dimensiones Dinámicas** (2h)

**Problema:** OpenAI usa 1536 dims, Ollama usa 768 dims

**Solución:**

1. **Agregar método a provider:**

```typescript
interface AIProvider {
  getEmbeddingDimensions(): number;
}
```

1. **Actualizar validaciones en `rag.service.ts`:**

```typescript
const provider = getAIProvider();
const expectedDims = provider.getEmbeddingDimensions();

if (embedding.length !== expectedDims) {
  throw new HttpError(400, `Expected ${expectedDims} dims, got ${embedding.length}`);
}
```

1. **Índices vectoriales separados en Atlas:**
   - `vector_index_openai_1536` (para OpenAI)
   - `vector_index_ollama_768` (para Ollama)
   - Seleccionar índice según provider activo

---

#### **TASK 1.9: Actualizar Tests Existentes** (1h)

**Modificar todos los tests que usan OpenAI directamente:**

```typescript
// Antes
import OpenAIClient from '...';

// Después
import { getAIProvider } from '...';
process.env.AI_PROVIDER = 'mock';  // Para tests rápidos
```

**Archivos a modificar:**

- `tests/unit/services/ai/*.test.ts`
- `tests/integration/ai/*.test.ts`

---

### ✅ Checklist RFE-AI-001

- [ ] `embedding.service.ts` usa `getAIProvider()`
- [ ] `llm.service.ts` usa `getAIProvider()`
- [ ] Hack de `global.__OPENAI_CREATE__` eliminado
- [ ] Método `getEmbeddingDimensions()` implementado
- [ ] Manejo de índices vectoriales dinámicos
- [ ] Todos los tests pasando con `AI_PROVIDER=mock`
- [ ] Tests de integración pasando con `AI_PROVIDER=openai`
- [ ] Tests de integración pasando con `AI_PROVIDER=ollama`
- [ ] README actualizado con configuración de proveedores

---

## 🟠 FASE 2: Alta Prioridad - Auto-procesamiento

**Duración Estimada:** 6-8h  
**Issue:** RFE-AI-002

---

### **RFE-AI-002: Campos AI en Document Model + Auto-Procesamiento** (6-8h)

#### **TASK 2.1: Extender Document Schema** (1h)

**Archivo:** `src/models/document.model.ts`

```typescript
const documentSchema = new Schema({
  // ... campos existentes ...

  // 🆕 AI Metadata
  aiProcessingStatus: {
    type: String,
    enum: ['none', 'pending', 'processing', 'completed', 'failed'],
    default: 'none',
    index: true
  },
  aiCategory: {
    type: String,
    default: null,
    index: true
  },
  aiConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null
  },
  aiTags: {
    type: [String],
    default: []
  },
  aiSummary: {
    type: String,
    default: null
  },
  aiKeyPoints: {
    type: [String],
    default: []
  },
  extractedText: {
    type: String,
    default: null,
    select: false  // No incluir por defecto (puede ser grande)
  },
  aiProcessedAt: {
    type: Date,
    default: null
  },
  aiError: {
    type: String,
    default: null
  }
});
```

**Migración:**

```bash
# No requiere script - campos opcionales con defaults
```

---

#### **TASK 2.2: Crear Job de Procesamiento Asíncrono** (2h)

**Archivo:** `src/jobs/process-document-ai.job.ts`

```typescript
export async function processDocumentAI(documentId: string): Promise<void> {
  const doc = await DocumentModel.findById(documentId);
  
  try {
    // 1. Actualizar estado a 'processing'
    doc.aiProcessingStatus = 'processing';
    await doc.save();

    // 2. Extraer texto
    const extracted = await textExtractionService.extractText(doc.path, doc.mimeType);
    
    // 3. Guardar texto extraído
    doc.extractedText = extracted.text;
    await doc.save();

    // 4. Procesar chunks + embeddings
    await documentProcessor.processDocument(
      doc._id.toString(),
      doc.organization.toString(),
      extracted.text
    );

    // 5. Clasificar (requiere RFE-AI-003)
    // const classification = await aiService.classifyDocument(extracted.text);
    // doc.aiCategory = classification.category;
    // doc.aiTags = classification.tags;

    // 6. Resumir (requiere RFE-AI-007)
    // const summary = await aiService.summarizeDocument(extracted.text);
    // doc.aiSummary = summary.summary;

    // 7. Marcar como completado
    doc.aiProcessingStatus = 'completed';
    doc.aiProcessedAt = new Date();
    await doc.save();

    console.log(`[ai-job] Document ${documentId} processed successfully`);
  } catch (error) {
    doc.aiProcessingStatus = 'failed';
    doc.aiError = error.message;
    await doc.save();
    console.error(`[ai-job] Failed to process document ${documentId}:`, error);
  }
}
```

---

#### **TASK 2.3: Integrar en Upload Controller** (1h)

**Archivo:** `src/controllers/document.controller.ts`

```typescript
export async function upload(req, res, next) {
  try {
    // ... lógica actual de upload ...
    
    const document = await DocumentModel.create({
      filename,
      mimeType,
      // ...
      aiProcessingStatus: 'pending'  // 🆕 Inicializar en pending
    });

    // 🆕 Disparar procesamiento asíncrono
    if (textExtractionService.isSupportedMimeType(document.mimeType)) {
      // No await - dispara y olvida
      processDocumentAI(document._id.toString())
        .catch(err => console.error('[upload] AI processing error:', err));
    }

    res.status(201).json({
      success: true,
      data: document
    });
  } catch (error) {
    next(error);
  }
}
```

---

#### **TASK 2.4: Endpoint de Estado de Procesamiento** (1h)

**Archivo:** `src/routes/document.routes.ts`

```typescript
/**
 * @route   GET /api/documents/:id/ai-status
 * @desc    Obtiene el estado de procesamiento AI de un documento
 */
router.get('/:id/ai-status', authMiddleware, documentController.getAIStatus);
```

**Controller:**

```typescript
export async function getAIStatus(req, res, next) {
  const document = await DocumentModel.findById(req.params.id)
    .select('aiProcessingStatus aiCategory aiTags aiSummary aiProcessedAt aiError');

  if (!document) {
    return next(new HttpError(404, 'Document not found'));
  }

  res.json({
    success: true,
    data: {
      status: document.aiProcessingStatus,
      category: document.aiCategory,
      tags: document.aiTags,
      summary: document.aiSummary,
      processedAt: document.aiProcessedAt,
      error: document.aiError
    }
  });
}
```

---

#### **TASK 2.5: Indexar metadata AI en Elasticsearch** (1h)

**Archivo:** `src/services/search.service.ts`

```typescript
async indexDocument(document: IDocument) {
  await esClient.index({
    index: 'documents',
    id: document._id.toString(),
    body: {
      // ... campos existentes ...
      
      // 🆕 Campos AI
      aiCategory: document.aiCategory,
      aiTags: document.aiTags,
      aiSummary: document.aiSummary,
      extractedText: document.extractedText  // 🆕 Ahora sí tiene contenido
    }
  });
}
```

---

#### **TASK 2.6: Tests de Auto-procesamiento** (1h)

**Crear:** `tests/integration/ai/auto-processing.test.ts`

```typescript
describe('Auto-processing on Upload', () => {
  it('should auto-process document after upload', async () => {
    const file = createTestPDF('Test content');
    
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('file', file)
      .set('Cookie', userToken);

    expect(response.body.data.aiProcessingStatus).toBe('pending');

    // Esperar procesamiento (usar polling o mock)
    await waitForProcessing(response.body.data._id);

    const doc = await DocumentModel.findById(response.body.data._id);
    expect(doc.aiProcessingStatus).toBe('completed');
    expect(doc.extractedText).toBeTruthy();
  });
});
```

---

### ✅ Checklist RFE-AI-002

- [ ] Document schema extendido con campos AI
- [ ] Job `processDocumentAI` implementado
- [ ] Upload controller dispara procesamiento asíncrono
- [ ] Endpoint `/ai-status` funcionando
- [ ] Elasticsearch indexa metadata AI
- [ ] Tests de auto-procesamiento pasando
- [ ] Documentación actualizada

---

## 🟡 FASE 3: Media Prioridad - Clasificación e Indexación

**Duración Estimada:** 10-12h

---

### **RFE-AI-003: Clasificación Automática** (5-6h)

#### **TASK 3.1: Definir Taxonomía de Categorías** (30min)

**Archivo:** `src/models/types/ai.types.ts`

```typescript
export const DOCUMENT_CATEGORIES = [
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
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];
```

---

#### **TASK 3.2: Implementar `classifyDocument()` en Provider** (2h)

**Interface:**

```typescript
interface AIProvider {
  classifyDocument(text: string): Promise<ClassificationResult>;
}

interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  tags: string[];
}
```

**Implementación OpenAI:**

```typescript
async classifyDocument(text: string): Promise<ClassificationResult> {
  const prompt = `Analiza el siguiente documento y clasifícalo.

Categorías posibles: ${DOCUMENT_CATEGORIES.join(', ')}

Texto:
${text.substring(0, 2000)}  // Primeros 2000 chars

Responde en JSON:
{
  "category": "...",
  "confidence": 0.95,
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const response = await this.generateResponse(prompt);
  return JSON.parse(response);
}
```

---

#### **TASK 3.3: Integrar en Job de Procesamiento** (30min)

**Archivo:** `src/jobs/process-document-ai.job.ts`

```typescript
// Agregar después del paso 4
const provider = getAIProvider();
const classification = await provider.classifyDocument(extracted.text);

doc.aiCategory = classification.category;
doc.aiConfidence = classification.confidence;
doc.aiTags = classification.tags;
```

---

#### **TASK 3.4: Endpoint Manual de Clasificación** (1h)

```typescript
/**
 * @route   POST /api/ai/documents/:id/classify
 * @desc    Clasifica manualmente un documento
 */
router.post('/documents/:id/classify', aiController.classifyDocument);
```

---

#### **TASK 3.5: Tests de Clasificación** (1h)

```typescript
describe('Document Classification', () => {
  it('should classify invoice correctly', async () => {
    const invoiceText = 'FACTURA No. 12345\nFecha: 2026-02-20\nTotal: $1,000';
    const result = await provider.classifyDocument(invoiceText);
    expect(result.category).toBe('Factura');
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

---

### **RFE-AI-004: Indexar Contenido en Elasticsearch** (4-5h)

#### **TASK 3.6: Actualizar Mapping de Elasticsearch** (1h)

**Archivo:** `src/configurations/elasticsearch-config.ts`

```typescript
const documentMapping = {
  properties: {
    filename: { type: 'text' },
    mimeType: { type: 'keyword' },
    
    // 🆕 Contenido completo
    extractedText: {
      type: 'text',
      analyzer: 'spanish',  // Analizar en español
      fields: {
        keyword: { type: 'keyword' }
      }
    },
    
    // 🆕 Metadata AI
    aiCategory: { type: 'keyword' },
    aiTags: { type: 'keyword' },
    aiSummary: { type: 'text', analyzer: 'spanish' }
  }
};
```

---

#### **TASK 3.7: Reindexar Documentos Existentes** (1h)

**Script:** `scripts/reindex-documents-es.ts`

```typescript
async function reindexAll() {
  const documents = await DocumentModel.find({ aiProcessingStatus: 'completed' });
  
  for (const doc of documents) {
    await searchService.indexDocument(doc);
  }
}
```

---

#### **TASK 3.8: Búsqueda Híbrida (ES + Vector)** (2h)

**Crear:** `src/services/hybrid-search.service.ts`

```typescript
export async function hybridSearch(
  query: string,
  organizationId: string
): Promise<SearchResult[]> {
  // 1. Búsqueda tradicional en Elasticsearch (BM25)
  const esResults = await searchService.search(query, organizationId);
  
  // 2. Búsqueda vectorial en MongoDB Atlas
  const vectorResults = await ragService.search(query, organizationId);
  
  // 3. Fusionar resultados (RRF - Reciprocal Rank Fusion)
  return mergeResults(esResults, vectorResults);
}
```

---

### ✅ Checklist Fase 3

- [ ] Taxonomía de categorías definida
- [ ] `classifyDocument()` implementado en providers
- [ ] Clasificación integrada en auto-procesamiento
- [ ] Endpoint manual de clasificación
- [ ] Mapping de ES actualizado con `extractedText`
- [ ] Script de reindexación ejecutado
- [ ] Búsqueda híbrida implementada
- [ ] Tests de clasificación pasando

---

## 🟢 FASE 4: Baja Prioridad - OCR y Summarization

**Duración Estimada:** 8-10h

---

### **RFE-AI-006: OCR para PDFs Escaneados** (4-5h)

#### **TASK 4.1: Instalar Tesseract** (30min)

```bash
# Windows
winget install UB-Mannheim.TesseractOCR

# NPM
npm install tesseract.js pdf2pic --save
```

---

#### **TASK 4.2: Implementar OCR Service** (2h)

**Crear:** `src/services/ai/ocr.service.ts`

```typescript
export class OCRService {
  async extractTextFromScannedPDF(pdfPath: string): Promise<string> {
    // 1. Convertir PDF a imágenes
    const images = await pdf2pic(pdfPath);
    
    // 2. OCR en cada imagen
    const texts = await Promise.all(
      images.map(img => tesseract.recognize(img))
    );
    
    // 3. Concatenar texto
    return texts.join('\n\n');
  }
}
```

---

#### **TASK 4.3: Integrar en Text Extraction** (1h)

**Archivo:** `src/services/ai/text-extraction.service.ts`

```typescript
async extractFromPdf(filePath: string): Promise<ITextExtractionResult> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  
  // Si el texto está vacío o muy corto, intentar OCR
  if (data.text.trim().length < 100) {
    console.log('[text-extraction] PDF appears scanned, using OCR...');
    const ocrText = await ocrService.extractTextFromScannedPDF(filePath);
    return { text: ocrText, /* ... */ };
  }
  
  return { text: data.text, /* ... */ };
}
```

---

### **RFE-AI-007: Endpoint de Summarization** (3-4h)

#### **TASK 4.4: Implementar `summarizeDocument()` en Provider** (1.5h)

```typescript
interface AIProvider {
  summarizeDocument(text: string): Promise<SummarizationResult>;
}

interface SummarizationResult {
  summary: string;      // 2-3 frases
  keyPoints: string[];  // 3-5 puntos clave
}
```

**Implementación:**

```typescript
async summarizeDocument(text: string): Promise<SummarizationResult> {
  const prompt = `Resume el siguiente documento en 2-3 frases y extrae 3-5 puntos clave.

Texto:
${text.substring(0, 4000)}

Responde en JSON:
{
  "summary": "...",
  "keyPoints": ["...", "...", "..."]
}`;

  const response = await this.generateResponse(prompt);
  return JSON.parse(response);
}
```

---

#### **TASK 4.5: Endpoint de Summarization** (1h)

```typescript
/**
 * @route   POST /api/ai/documents/:id/summarize
 * @desc    Genera un resumen de un documento
 */
router.post('/documents/:id/summarize', aiController.summarizeDocument);
```

---

#### **TASK 4.6: Integrar en Auto-procesamiento** (30min)

```typescript
// En process-document-ai.job.ts
const summary = await provider.summarizeDocument(extracted.text);
doc.aiSummary = summary.summary;
doc.aiKeyPoints = summary.keyPoints;
```

---

### ✅ Checklist Fase 4

- [ ] Tesseract instalado
- [ ] OCR service implementado
- [ ] Detección automática de PDFs escaneados
- [ ] `summarizeDocument()` en providers
- [ ] Endpoint `/summarize` funcionando
- [ ] Summarization en auto-procesamiento
- [ ] Tests de OCR y summarization

---

## 📊 Tracking de Progreso

### ✅ Sprint 1: Setup (FASE 0) - COMPLETADO

- **Inicio:** Febrero 20, 2026
- **Fin:** Febrero 20, 2026
- **Duración:** 2.5 horas (estimación: 2.5h)
- **Entregable:** ✅ Ollama funcionando + estructura de providers + 31 tests pasando
- **Estado:** **COMPLETADO AL 100%**

**Logros clave:**

- ✅ Ollama 0.16.2 instalado con modelos llama3.2:3b (2GB) y nomic-embed-text (274MB)
- ✅ Sistema de providers con Factory pattern implementado
- ✅ OpenAIProvider, OllamaProvider, MockProvider funcionando
- ✅ 31/31 tests de integración pasando
- ✅ Configuración unificada en .env (eliminado .env.local)

---

### 🟡 Sprint 2: Críticos (FASE 1) - PENDIENTE

- **Duración:** 8-10 horas (2-3 días)
- **Entregable:** Cross-org leak arreglado + abstracción completa
- **Estado:** **PRÓXIMO** 🎯

---

### ⚪ Sprint 3: Auto-procesamiento (FASE 2) - PENDIENTE

- **Duración:** 2 días
- **Entregable:** Upload dispara procesamiento automático

---

### ⚪ Sprint 4: Clasificación (FASE 3) - PENDIENTE

- **Duración:** 3 días
- **Entregable:** Clasificación automática + búsqueda de contenido

---

### ⚪ Sprint 5: Extras (FASE 4) - PENDIENTE

- **Duración:** 2-3 días
- **Entregable:** OCR + Summarization

---

## 🧪 Estrategia de Testing

### Tests por Fase

**✅ Fase 0 (Completada):**

- ✅ Integration tests con Ollama real (18 tests)
- ✅ Unit tests con MockProvider (13 tests)
- ✅ Factory pattern tests
- **Resultado:** 31/31 tests pasando

**Fase 0:**

- Integration tests con Ollama real
- Unit tests con MockProvider

**Fase 1:**

- Security tests para cross-org leak
- Tests con cada provider (openai, ollama, mock)

**Fase 2:**

- E2E test: upload → auto-processing → status endpoint
- Tests de jobs asíncronos

**Fase 3:**

- Tests de clasificación con diferentes tipos de documentos
- Tests de búsqueda híbrida

**Fase 4:**

- Tests con PDFs escaneados
- Tests de summarization

---

## 📝 Notas de Implementación

### Variables de Entorno Finales

```bash
# AI Provider Selection
AI_PROVIDER=openai  # openai | ollama | mock

# OpenAI (si AI_PROVIDER=openai)
OPENAI_API_KEY=sk-proj-...

# Ollama (si AI_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# MongoDB Atlas
MONGO_ATLAS_URI=mongodb+srv://...

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200
```

---

## 🎯 Criterios de Éxito

### ✅ Fase 0 - COMPLETADA

✅ Ollama genera embeddings y respuestas correctamente  
✅ Se puede cambiar de provider con una variable de entorno  
✅ Tests corren sin API keys con `AI_PROVIDER=mock`  
✅ 31/31 tests de integración pasando  
✅ Configuración unificada en .env

### Fase 1 - PRÓXIMA 🎯

✅ Usuario de Org A NO puede ver datos de Org B en RAG  
✅ Código no depende directamente de OpenAI SDK  
✅ Tests pasan con los 3 providers

### Fase 2

✅ Subir documento dispara procesamiento automático  
✅ Frontend puede consultar estado vía `/ai-status`  
✅ Metadata AI se guarda en Document model

### Fase 3

✅ Documentos se clasifican automáticamente  
✅ Búsqueda en Elasticsearch incluye contenido extraído  
✅ Búsqueda híbrida mejora resultados de relevancia

### Fase 4

✅ PDFs escaneados se procesan con OCR  
✅ Endpoint de summarization genera resúmenes coherentes

---

## 📌 Estado Actual

**✅ Fase 0 Completada** (Febrero 20, 2026)  
**🎯 Siguiente:** Fase 1 - Críticos (Seguridad y Abstracción)

**Progreso Total:** 2.5h / 34-43h (6-7% completado)

**Para comenzar Fase 1:**

```bash
# Verificar que todo funcione
npm test

# Confirmar que AI_PROVIDER está configurado
grep AI_PROVIDER .env
```

---

_Este roadmap se actualizará conforme avancemos en la implementación._
