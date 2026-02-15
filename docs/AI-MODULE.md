# Módulo de Inteligencia Artificial - CloudDocs API

## 📋 Índice

1. [Introducción](#introducción)
2. [Arquitectura](#arquitectura)
3. [Componentes Implementados](#componentes-implementados)
4. [Endpoints de la API](#endpoints-de-la-api)
5. [Servicios](#componentes-implementados)
6. [Configuración](#configuración)
7. [Flujos de Uso](#flujos-de-uso)
8. [Testing](#testing)
9. [Consideraciones de Seguridad](#consideraciones-de-seguridad)
10. [Troubleshooting](#troubleshooting)

---

## Introducción

El módulo de IA de CloudDocs implementa capacidades de **RAG (Retrieval-Augmented Generation)** para permitir búsquedas semánticas y respuestas inteligentes sobre documentos almacenados en la plataforma.

### Características Principales

- ✅ **Extracción de texto** de múltiples formatos (PDF, DOCX, DOC, TXT, MD)
- ✅ **Chunking inteligente** preservando límites de párrafos
- ✅ **Embeddings vectoriales** usando OpenAI (text-embedding-3-small, 1536 dimensiones)
- ✅ **Búsqueda vectorial** en MongoDB Atlas con $vectorSearch
- ✅ **Generación de respuestas** con GPT-4o-mini
- ✅ **Multi-tenancy** - Aislamiento por organización
- ✅ **Control de acceso** - Basado en permisos de documentos

---

## Arquitectura

### Stack Tecnológico

```s
┌─────────────────────────────────────────────────────────┐
│                   CloudDocs Frontend                     │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Express.js API (Node.js 20+)               │
│  ┌─────────────────────────────────────────────────┐   │
│  │           AI Routes & Controllers               │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     ▼                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │              AI Services Layer                  │   │
│  │  • RAG Service                                  │   │
│  │  • Text Extraction Service                      │   │
│  │  • Document Processor Service                   │   │
│  │  • Embedding Service                            │   │
│  │  • LLM Service                                  │   │
│  │  • Prompt Builder                               │   │
│  └──────────────┬──────────────────┬───────────────┘   │
└─────────────────┼──────────────────┼───────────────────┘
                  │                  │
                  ▼                  ▼
    ┌─────────────────────┐  ┌──────────────────┐
    │  MongoDB (Local)    │  │  MongoDB Atlas   │
    │  • Documents        │  │  • Chunks        │
    │  • Users            │  │  • Embeddings    │
    │  • Organizations    │  │  • Vector Index  │
    └─────────────────────┘  └──────────────────┘

                  ▼
         ┌──────────────────┐
         │   OpenAI API     │
         │  • Embeddings    │
         │  • GPT-4o-mini   │
         └──────────────────┘
```

### Base de Datos Dual

**MongoDB Local (Mongoose):**

- Almacena datos principales de la aplicación
- Documentos, usuarios, organizaciones, carpetas
- Relaciones y permisos

**MongoDB Atlas (Native Driver):**

- Almacena chunks de documentos
- Embeddings vectoriales (1536 dimensiones)
- Índice vectorial para búsqueda semántica

### Flujo RAG Completo

```text
┌──────────────┐
│  Documento   │
│  (PDF/DOCX)  │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Text Extraction  │ ← pdf-parse, mammoth
│   Service        │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│    Chunking      │ ← 800 palabras/chunk
│    Utility       │   preserva párrafos
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   Embedding      │ ← OpenAI API
│   Service        │   text-embedding-3-small
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  MongoDB Atlas   │ ← Almacena chunks
│  document_chunks │   + embeddings
└──────────────────┘

       ┌─────────────┐
       │  Usuario    │
       │  Pregunta   │
       └──────┬──────┘
              │
              ▼
       ┌──────────────┐
       │  Embedding   │ ← Embedding de pregunta
       │  Service     │
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ Vector Search│ ← $vectorSearch
       │ RAG Service  │   cosine similarity
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │Prompt Builder│ ← Construye prompt
       │              │   con contexto
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │ LLM Service  │ ← GPT-4o-mini
       │              │   genera respuesta
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  Respuesta   │
       │  + Sources   │
       └──────────────┘
```

---

## Componentes Implementados

### 1. Configuraciones

#### `src/configurations/openai-config.ts`

- Cliente OpenAI singleton
- Validación de API key
- Método `checkConnection()` para verificar conectividad

#### `src/configurations/database-config/mongoAtlas.ts`

- Conexión MongoDB Atlas con driver nativo
- Singleton `getDb()` para acceso a la base de datos
- Separado de Mongoose para búsqueda vectorial

### 2. Servicios de IA

#### `src/services/ai/embedding.service.ts`

**Responsabilidad:** Generación de embeddings vectoriales

```typescript
// Métodos principales
generateEmbedding(text: string): Promise<number[]>
generateEmbeddings(texts: string[]): Promise<number[][]>
```

**Características:**

- Usa modelo `text-embedding-3-small` (1536 dimensiones)
- Batch processing para múltiples textos
- Validación de dimensiones
- Retry logic para errores transitorios

#### `src/services/ai/text-extraction.service.ts`

**Responsabilidad:** Extracción de texto de documentos

**Formatos soportados:**

- PDF (`application/pdf`) - usa `pdf-parse`
- DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) - usa `mammoth`
- DOC (`application/msword`) - usa `mammoth`
- TXT (`text/plain`) - lectura directa
- MD (`text/markdown`) - lectura directa

**Métodos:**

```typescript
extractText(filePath: string, mimeType: string): Promise<ITextExtractionResult>
isSupportedMimeType(mimeType: string): boolean
getSupportedMimeTypes(): string[]
```

**Metadata extraída (PDFs):**

- Número de páginas
- Autor, título, asunto
- Creador, productor
- Fechas de creación y modificación

#### `src/services/document-processor.service.ts`

**Responsabilidad:** Orquestación del procesamiento de documentos

```typescript
// Métodos principales
processDocument(documentId: string, text: string): Promise<IProcessingResult>
deleteDocumentChunks(documentId: string): Promise<number>
getChunksByDocument(documentId: string): Promise<IDocumentChunk[]>
getStatistics(documentId: string): Promise<IChunkStatistics>
```

**Flujo de procesamiento:**

1. Validar entrada
2. Dividir texto en chunks (chunking.util)
3. Generar embeddings para cada chunk
4. Almacenar en MongoDB Atlas
5. Retornar estadísticas

#### `src/services/ai/rag.service.ts`

**Responsabilidad:** Búsqueda vectorial y orquestación RAG

```typescript
// Búsqueda vectorial
search(query: string, topK?: number): Promise<ISearchResult[]>
searchInDocument(query: string, documentId: string, topK?: number): Promise<ISearchResult[]>

// RAG
answerQuestion(question: string, topK?: number): Promise<IRagResponse>
answerQuestionInDocument(question: string, documentId: string, topK?: number): Promise<IRagResponse>
```

**Características:**

- Usa `$vectorSearch` de MongoDB Atlas
- Cosine similarity para relevancia
- Top-K resultados (default: 5)
- Índice vectorial: "default"

#### `src/services/ai/llm.service.ts`

**Responsabilidad:** Llamadas al modelo de lenguaje

```typescript
generateResponse(prompt: string, options?: IGenerationOptions): Promise<string>
generateStreamingResponse(prompt: string, options?: IGenerationOptions): AsyncGenerator<string>
```

**Configuración:**

- Modelo: `gpt-4o-mini`
- Temperature: 0.3 (determinístico para respuestas basadas en hechos)
- Max tokens: 1000
- Soporte para streaming

#### `src/services/ai/prompt.builder.ts`

**Responsabilidad:** Construcción de prompts RAG

```typescript
buildPrompt(question: string, contextChunks: string[]): string
buildSimplePrompt(question: string, contextChunks: string[]): string
```

**Estructura del prompt:**

```text
Instrucciones para el asistente IA
↓
Contexto (chunks numerados)
[Fragmento 1] contenido...
[Fragmento 2] contenido...
↓
Pregunta del usuario
↓
Placeholder para respuesta
```

### 3. Utilidades

#### `src/utils/chunking.util.ts`

**Responsabilidad:** División inteligente de textos

```typescript
splitIntoChunks(text: string, targetWords?: number): string[]
```

**Configuración:**

- Target: 800 palabras por chunk
- Mínimo: 100 palabras
- Máximo: 1000 palabras

**Estrategia:**

1. Divide por párrafos (`\n\n`)
2. Si el párrafo es muy largo, divide por oraciones
3. Si la oración es muy larga, divide por palabras
4. Preserva coherencia del texto

### 4. Modelos y Tipos

#### `src/models/types/ai.types.ts`

Definiciones TypeScript centralizadas:

```typescript
interface IDocumentChunk {
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  wordCount: number;
  charCount: number;
  createdAt: Date;
}

interface ISearchResult {
  chunk: IDocumentChunk;
  score: number;
}

interface IRagResponse {
  answer: string;
  sources: string[];
  chunks?: Array<{
    documentId: string;
    content: string;
    score: number;
  }>;
}

interface ITextExtractionResult {
  text: string;
  charCount: number;
  wordCount: number;
  mimeType: string;
  metadata?: {
    pages?: number;
    author?: string;
    title?: string;
    // ... más campos
  };
}

interface IProcessingResult {
  documentId: string;
  chunksCreated: number;
  dimensions: number;
  processingTimeMs: number;
}
```

---

## Endpoints de la API

Todos los endpoints requieren autenticación JWT y están bajo `/api/ai`.

### 1. Extraer Texto de Documento

```http
GET /api/ai/documents/:documentId/extract-text
```

**Headers:**

```test
Cookie: token=<jwt_token>
```

**Response 200:**

```json
{
  "success": true,
  "message": "Text extracted successfully",
  "data": {
    "text": "Contenido del documento...",
    "charCount": 5420,
    "wordCount": 890,
    "mimeType": "application/pdf",
    "metadata": {
      "pages": 5,
      "author": "John Doe",
      "title": "Informe Anual 2025",
      "creationDate": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

**Errores:**

- `400` - ID de documento inválido o tipo MIME no soportado
- `401` - No autenticado
- `403` - Sin permisos para acceder al documento
- `404` - Documento no encontrado

### 2. Procesar Documento

```http
POST /api/ai/documents/:documentId/process
```

**Headers:**

```s
Cookie: token=<jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "text": "Este es el contenido completo del documento..."
}
```

**Response 200:**

```json
{
  "success": true,
  "message": "Document processed successfully",
  "data": {
    "documentId": "507f1f77bcf86cd799439011",
    "chunksCreated": 12,
    "dimensions": 1536,
    "processingTimeMs": 2547.3
  }
}
```

**Errores:**

- `400` - Texto vacío o inválido
- `401` - No autenticado
- `403` - Solo el propietario puede procesar
- `404` - Documento no encontrado

### 3. Eliminar Chunks de Documento

```http
DELETE /api/ai/documents/:documentId/chunks
```

**Headers:**

```s
Cookie: token=<jwt_token>
```

**Response 200:**

```json
{
  "success": true,
  "message": "Document chunks deleted successfully",
  "data": {
    "deletedCount": 12
  }
}
```

**Errores:**

- `400` - ID de documento inválido
- `401` - No autenticado
- `403` - Solo el propietario puede eliminar
- `404` - Documento no encontrado

### 4. Preguntar (RAG General)

```http
POST /api/ai/ask
```

**Headers:**

```s
Cookie: token=<jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "question": "¿Cuáles son los objetivos del Q1 2026?",
  "organizationId": "507f1f77bcf86cd799439012"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "answer": "Según los documentos encontrados, los principales objetivos del Q1 2026 son: 1) Aumentar las ventas en un 20%, 2) Mejorar la satisfacción del cliente, y 3) Implementar nuevas funcionalidades de IA en el sistema.",
    "sources": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439013"],
    "chunks": [
      {
        "documentId": "507f1f77bcf86cd799439011",
        "content": "Los objetivos del Q1 2026 incluyen...",
        "score": 0.892
      }
    ]
  }
}
```

**Errores:**

- `400` - Pregunta vacía o sin organizationId
- `401` - No autenticado
- `403` - No es miembro de la organización

### 5. Preguntar sobre Documento Específico

```http
POST /api/ai/documents/:documentId/ask
```

**Headers:**

```s
Cookie: token=<jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "question": "¿De qué trata este documento?"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "answer": "Este documento trata sobre la implementación de nuevas funcionalidades de IA en el sistema CloudDocs, incluyendo búsqueda semántica y respuestas automáticas...",
    "sources": ["507f1f77bcf86cd799439011"],
    "chunks": [...]
  }
}
```

**Errores:**

- `400` - Pregunta vacía o ID inválido
- `401` - No autenticado
- `403` - Sin permisos para el documento
- `404` - Documento no encontrado

---

## Configuración

### Variables de Entorno

Agregar al archivo `.env`:

```bash
# MongoDB Atlas para búsqueda vectorial
MONGO_ATLAS_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/cloud_docs?retryWrites=true&w=majority

# OpenAI API
OPENAI_API_KEY=sk-proj-...your-api-key...
```

### Índice Vectorial en MongoDB Atlas

**Crear índice en la colección `document_chunks`:**

```javascript
{
  "name": "default",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 1536,
        "similarity": "cosine"
      },
      {
        "type": "filter",
        "path": "documentId"
      }
    ]
  }
}
```

**Pasos en Atlas UI:**

1. Ir a Atlas Search
2. Crear nuevo índice
3. Seleccionar colección `document_chunks`
4. Copiar configuración JSON arriba
5. Guardar con nombre "default"

### Instalación de Dependencias

```bash
npm install openai mongodb pdf-parse mammoth
npm install --save-dev @types/pdf-parse
```

---

## Flujos de Uso

### Flujo 1: Procesar un Nuevo Documento

```javascript
// 1. Subir documento (endpoint existente)
POST /api/documents/upload
→ Retorna documentId

// 2. Extraer texto del documento
GET /api/ai/documents/{documentId}/extract-text
→ Retorna { text, charCount, wordCount, metadata }

// 3. Procesar documento (chunking + embeddings)
POST /api/ai/documents/{documentId}/process
Body: { text: "contenido extraído..." }
→ Retorna { chunksCreated, dimensions }

// Ahora el documento está listo para búsqueda RAG
```

### Flujo 2: Hacer Pregunta General

```javascript
// Usuario pregunta sobre toda la organización
POST /api/ai/ask
Body: {
  question: "¿Qué proyectos tenemos activos?",
  organizationId: "org123"
}

→ Sistema busca en todos los documentos procesados de la org
→ Genera respuesta con fuentes
→ Retorna { answer, sources, chunks }
```

### Flujo 3: Hacer Pregunta sobre Documento

```javascript
// Usuario pregunta sobre un documento específico
POST /api/ai/documents/{documentId}/ask
Body: {
  question: "Resume los puntos clave"
}

→ Sistema busca solo en ese documento
→ Genera respuesta contextualizada
→ Retorna { answer, sources: [documentId], chunks }
```

### Flujo 4: Reprocesar Documento

```javascript
// 1. Eliminar chunks anteriores
DELETE /api/ai/documents/{documentId}/chunks
→ Retorna { deletedCount }

// 2. Extraer texto actualizado
GET /api/ai/documents/{documentId}/extract-text

// 3. Procesar nuevamente
POST /api/ai/documents/{documentId}/process
Body: { text: "contenido actualizado..." }
```

---

## Testing

### Tests de Integración

Archivo: `tests/integration/ai.test.ts`

**Cobertura:**

- ✅ Extracción de texto (4 tests)
- ✅ Procesamiento de documentos (4 tests)
- ✅ Eliminación de chunks (3 tests)
- ✅ Preguntas RAG generales (4 tests)
- ✅ Preguntas sobre documentos (4 tests)

**Total:** 17 tests de integración

### Tests Unitarios

**`tests/unit/utils/chunking.util.test.ts`** (10 tests)

- División de texto largo
- Tamaño objetivo personalizado
- Preservación de párrafos
- Texto vacío y edge cases

**`tests/unit/services/prompt.builder.test.ts`** (10 tests)

- Construcción de prompts RAG
- Numeración de chunks
- Manejo de caracteres especiales
- Contenido multilingüe

**`tests/unit/services/text-extraction.service.test.ts`** (10+ tests)

- Extracción TXT y MD
- Validación de tipos MIME
- Conteo de palabras
- Manejo de errores

**Total:** 30+ tests unitarios

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Solo tests de IA
npm test -- tests/integration/ai.test.ts
npm test -- tests/unit/services/ tests/unit/utils/

# Con cobertura
npm run test:coverage
```

**Nota:** Tests que llaman a OpenAI tienen timeout extendido (30s):

```typescript
it('should process document', async () => {
  // test code
}, 30000);
```

---

## Consideraciones de Seguridad

### Multi-tenancy

✅ **Aislamiento por Organización:**

- Endpoint `/api/ai/ask` filtra resultados por `organizationId`
- Solo retorna documentos de la organización del usuario
- Previene data leaks entre organizaciones

### Control de Acceso

✅ **Permisos de Documentos:**

- Extracción de texto: requiere acceso al documento (owner/shared/org member)
- Procesamiento: solo el propietario puede procesar
- Eliminación de chunks: solo el propietario
- Preguntas: respeta permisos de documentos

### Validación de Inputs

✅ **Sanitización:**

- Validación de ObjectId en MongoDB
- Validación de tipos MIME soportados
- Sanitización de paths de archivos
- Validación de texto no vacío

### Rate Limiting

✅ **Protección contra Abuse:**

- `generalRateLimiter` aplicado a todos los endpoints
- Previene spam de llamadas a OpenAI
- Protege contra costos excesivos

### Secrets Management

✅ **Variables de Entorno:**

- API keys nunca en código
- Uso de `.env` local
- Variables separadas para test/producción

---

## Troubleshooting

### Error: "OPENAI_API_KEY not configured"

**Causa:** Variable de entorno no configurada

**Solución:**

```bash
# .env
OPENAI_API_KEY=sk-proj-your-key-here
```

### Error: "MongoDB Atlas connection failed"

**Causa:** URI de Atlas inválida o network access no configurado

**Solución:**

1. Verificar `MONGO_ATLAS_URI` en `.env`
2. En Atlas: Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)
3. Verificar usuario/contraseña en connection string

### Error: "Vector search failed: Index not found"

**Causa:** Índice vectorial no creado en Atlas

**Solución:**

1. Ir a Atlas Search en la UI
2. Crear índice "default" en colección `document_chunks`
3. Usar configuración JSON de la sección [Configuración](#índice-vectorial-en-mongodb-atlas)

### Error: "Unsupported file type"

**Causa:** Tipo MIME del documento no soportado

**Solución:**

- Formatos soportados: PDF, DOCX, DOC, TXT, MD
- Verificar que el documento sea de uno de estos tipos
- Para otros formatos, convertir primero

### Error: "Question cannot be empty"

**Causa:** Request body sin campo `question` o vacío

**Solución:**

```json
{
  "question": "Tu pregunta aquí",
  "organizationId": "org-id" // para /api/ai/ask
}
```

### Tests Fallan con Timeout

**Causa:** Llamadas a OpenAI pueden tardar

**Solución:**

- Tests con OpenAI tienen timeout de 30s
- Para tests locales rápidos, considerar mocking de OpenAI
- Verificar conexión a internet

### Error: "Failed to extract text"

**Causa:** Archivo corrupto o path incorrecto

**Solución:**

- Verificar que el archivo existe en storage
- Verificar permisos de lectura
- Probar con otro archivo del mismo tipo

---

## Métricas y Monitoreo

### Logging

Todos los servicios incluyen logging con prefijos:

```info
[openai] Checking OpenAI connection...
[embedding] Generating embedding for text (150 chars)
[processor] Processing document 507f... (1500 words)
[rag] Searching for: "¿cuáles son los objetivos?"
[rag] Found 5 relevant chunks
[llm] Generating response with GPT-4o-mini
[text-extraction] Extracting text from document.pdf (application/pdf)
```

### Costos OpenAI

**Embeddings (text-embedding-3-small):**

- Costo: ~$0.00002 / 1K tokens
- Ejemplo: 10,000 palabras ≈ 13,000 tokens ≈ $0.00026

**Generación (gpt-4o-mini):**

- Input: ~$0.00015 / 1K tokens
- Output: ~$0.00060 / 1K tokens
- Ejemplo respuesta: ~500 tokens input + 200 output ≈ $0.00020

**Optimizaciones:**

- Chunking reduce tokens por llamada
- Cache de embeddings (solo procesar una vez)
- Temperature baja (0.3) para respuestas concisas

### Performance

**Tiempos esperados:**

- Extracción texto (PDF 10 páginas): ~500ms
- Chunking (10,000 palabras): ~50ms
- Embedding (1 chunk): ~200ms
- Búsqueda vectorial: ~100ms
- Generación LLM: ~2-5s

---

## Roadmap Futuro

### Mejoras Planificadas

- [ ] **Background Processing:** Procesar automáticamente al subir documento
- [ ] **Streaming Responses:** SSE para respuestas en tiempo real
- [ ] **Cache de Respuestas:** Redis para preguntas frecuentes
- [ ] **Más Formatos:** Excel, PowerPoint, imágenes (OCR)
- [ ] **Modelos Locales:** Opción de embeddings locales (sentence-transformers)
- [ ] **Fine-tuning:** Modelo customizado para dominio específico
- [ ] **Feedback Loop:** Usuarios pueden marcar respuestas correctas/incorrectas
- [ ] **Analytics:** Dashboard de uso de IA por organización
- [ ] **Multimodal:** Procesar imágenes en documentos
- [ ] **Summarization:** Auto-resúmenes de documentos largos

---

## Referencias

### Dependencias

- **OpenAI SDK:** <https://github.com/openai/openai-node>
- **pdf-parse:** <https://github.com/modesty/pdf-parse>
- **mammoth:** <https://github.com/mwilliamson/mammoth.js>
- **MongoDB Node Driver:** <https://docs.mongodb.com/drivers/node/current/>

### Documentación Externa

- **OpenAI Embeddings:** <https://platform.openai.com/docs/guides/embeddings>
- **OpenAI GPT-4o-mini:** <https://platform.openai.com/docs/models/gpt-4o-mini>
- **MongoDB Vector Search:** <https://www.mongodb.com/docs/atlas/atlas-vector-search/>
- **RAG Overview:** <https://www.pinecone.io/learn/retrieval-augmented-generation/>

### Recursos Internos

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Arquitectura general del proyecto
- [AGENTS.md](../AGENTS.md) - Reglas para agentes de IA
- [openapi.json](./openapi/openapi.json) - Especificación completa de la API
- [TEST-GUIDE.md](../tests/TEST-GUIDE.md) - Guía de testing

---

## Licencia

MIT License - Ver archivo LICENSE en la raíz del proyecto

---

## Contacto y Soporte

Para preguntas o problemas con el módulo de IA:

- **Issues:** <https://github.com/PALMIRARBT/Actividad-1_TFM-CloudDocsCopilot-backend-MVP/issues>
- **Email:** <support@clouddocs.example.com>
- **Documentación:** Ver `/api/docs` en el servidor

---

**Última actualización:** Febrero 2026  
**Versión del módulo:** 1.0.0  
**Mantenedores:** CloudDocs AI Team
