# RFE-AI-002: Campos AI en Document Model + Auto-Procesamiento en Upload

## 📋 Resumen

| Campo | Valor |
|-------|-------|
| **Fecha** | Febrero 16, 2026 |
| **Estado** | 📋 Propuesto |
| **Issues relacionadas** | [#46 (US-201)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/46), [#47 (US-202)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/47), [#48 (US-203)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/48), [#52 (US-205)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/52) |
| **Épica** | Inteligencia Artificial (Core MVP) |
| **Prioridad** | 🔴 Crítica (bloquea todas las US de IA) |
| **Estimación** | 8h |
| **Repositorio** | `cloud-docs-api-service` |

---

## 🎯 Objetivo

1. Extender el modelo `Document` de MongoDB con los campos necesarios para almacenar metadata generada por IA (categoría, tags, resumen, estado de procesamiento, texto extraído).
2. Integrar un pipeline de procesamiento AI asíncrono que se dispare automáticamente al subir un documento.
3. Que el upload NO se bloquee — el usuario recibe respuesta inmediata y el procesamiento ocurre en background.

---

## 📡 Estado Actual

### Document Model (`src/models/document.model.ts`)

El modelo actual tiene estos campos (sin ningún campo AI):

```typescript
{
  filename: String,
  originalname: String,
  mimeType: String,
  size: Number,
  path: String,
  uploadedBy: ObjectId (ref: User),
  organization: ObjectId (ref: Organization),
  folder: ObjectId (ref: Folder),
  // timestamps: createdAt, updatedAt
}
```

**No hay:** `aiProcessingStatus`, `aiCategory`, `aiTags`, `aiSummary`, `extractedText`, etc.

### Upload Flow (`src/controllers/document.controller.ts`)

El controlador `upload()` actual:
1. Recibe archivo via multer
2. Crea documento en MongoDB
3. Indexa en Elasticsearch (solo metadata: filename, mimeType, etc.)
4. Retorna el documento creado

**No hay:** Ningún trigger de procesamiento AI post-upload.

### Consecuencia

- Los documentos no contienen ninguna metadata de IA
- El procesamiento AI es 100% manual (3 llamadas API separadas)
- No hay forma de saber si un documento ha sido procesado por IA

---

## 🏗️ Arquitectura Propuesta

### Nuevos Campos en Document Schema

```typescript
// Añadir a src/models/document.model.ts

const documentSchema = new Schema({
  // --- Campos existentes (sin cambios) ---
  filename: { type: String, required: true },
  originalname: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  folder: { type: Schema.Types.ObjectId, ref: 'Folder' },

  // --- NUEVOS: AI Metadata ---
  aiProcessingStatus: {
    type: String,
    enum: ['none', 'pending', 'processing', 'completed', 'failed'],
    default: 'none',
    index: true,  // Para queries de estado
  },
  aiCategory: {
    type: String,
    default: null,
    index: true,  // Para filtros de categoría
  },
  aiConfidence: {
    type: Number,
    min: 0,
    max: 1,
    default: null,
  },
  aiTags: [{
    type: String,
  }],
  aiSummary: {
    type: String,
    default: null,
  },
  aiKeyPoints: [{
    type: String,
  }],
  extractedText: {
    type: String,
    default: null,
    select: false,  // No incluir en queries por defecto (puede ser >100KB)
  },
  aiProcessedAt: {
    type: Date,
    default: null,
  },
  aiError: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Índice compuesto para buscar docs procesados por org
documentSchema.index({ organization: 1, aiProcessingStatus: 1 });
documentSchema.index({ organization: 1, aiCategory: 1 });
documentSchema.index({ aiTags: 1 });
```

### Diagrama de campos

```
Document
├── filename              (existente)
├── originalname          (existente)
├── mimeType              (existente)
├── size                  (existente)
├── path                  (existente)
├── uploadedBy            (existente)
├── organization          (existente)
├── folder                (existente)
│
├── aiProcessingStatus    ← NUEVO: 'none'|'pending'|'processing'|'completed'|'failed'
├── aiCategory            ← NUEVO: 'Factura'|'Contrato'|...|'Otro'|null
├── aiConfidence          ← NUEVO: 0.0-1.0|null
├── aiTags[]              ← NUEVO: ['finanzas','2026','proveedor-X']
├── aiSummary             ← NUEVO: '2-3 frases de resumen'|null
├── aiKeyPoints[]         ← NUEVO: ['Punto clave 1','Punto clave 2',...]
├── extractedText         ← NUEVO: 'texto completo extraído' (select:false)
├── aiProcessedAt         ← NUEVO: Date|null
└── aiError               ← NUEVO: 'mensaje de error si falló'|null
```

---

## 🔄 Pipeline de Procesamiento AI Automático

### Flujo Completo

```
POST /api/documents/upload
         │
    ┌────┴────────────────────────────────────┐
    │  Flujo actual (SIN CAMBIOS):             │
    │  1. Multer recibe archivo                │
    │  2. Validar plan/cuotas                  │
    │  3. Mover archivo a storage/             │
    │  4. Crear Document en MongoDB            │
    │  5. Indexar metadata en Elasticsearch    │
    └────┬────────────────────────────────────┘
         │
    ┌────┴────────────────────────────────────┐
    │  NUEVO: Trigger AI (si AI_ENABLED=true   │
    │  y AI_AUTO_PROCESS=true):                │
    │                                          │
    │  1. document.aiProcessingStatus = 'pending'  │
    │  2. document.save()                      │
    │  3. Lanzar processDocumentAsync(docId)   │
    │     → setImmediate() o worker queue      │
    │     → NO bloquea la respuesta HTTP       │
    └────┬────────────────────────────────────┘
         │
    return res.status(201).json(document)
         │ (respuesta inmediata al frontend)
         │
    ┌────┴────────────────────────────────────┐
    │  Background: processDocumentAsync(docId) │
    │                                          │
    │  Status: 'pending' → 'processing'        │
    │                                          │
    │  PASO 1: Extraer texto                   │
    │  ├─ textExtraction.extractText(path, mime)│
    │  ├─ Guardar extractedText en Document    │
    │  └─ Si falla → status='failed', aiError  │
    │                                          │
    │  PASO 2: Clasificar + Etiquetar          │
    │  ├─ aiService.classifyDocument(text)     │
    │  ├─ Guardar aiCategory, aiConfidence,    │
    │  │  aiTags en Document                   │
    │  └─ Si confianza < 0.5 → 'Otro'         │
    │                                          │
    │  PASO 3: Resumir                         │
    │  ├─ aiService.summarizeDocument(text)    │
    │  ├─ Guardar aiSummary, aiKeyPoints       │
    │  └─ En Document                          │
    │                                          │
    │  PASO 4: Re-indexar en Elasticsearch     │
    │  ├─ searchService.updateDocumentIndex()  │
    │  ├─ Incluir: content, aiCategory, aiTags │
    │  └─                                      │
    │                                          │
    │  PASO 5: Chunking + Embeddings (opcional)│
    │  ├─ documentProcessor.processDocument()  │
    │  └─ Para búsqueda semántica/RAG          │
    │                                          │
    │  Status: 'processing' → 'completed'      │
    │  aiProcessedAt = new Date()              │
    └──────────────────────────────────────────┘
```

### Implementación del Pipeline

```typescript
// src/services/ai/ai-pipeline.service.ts

import { aiService } from './ai.service';
import { textExtractionService } from './text-extraction.service';
import { documentProcessorService } from '../document-processor.service';
import { searchService } from '../search.service';
import Document from '../../models/document.model';

export class AIPipelineService {
  /**
   * Procesa un documento completo: extracción → clasificación → resumen → indexación.
   * Diseñado para ejecutarse en background (no bloquea el upload).
   */
  async processDocument(documentId: string): Promise<void> {
    const document = await Document.findById(documentId).select('+extractedText');
    if (!document) throw new Error(`Document ${documentId} not found`);

    try {
      // Marcar como procesando
      document.aiProcessingStatus = 'processing';
      await document.save();

      const provider = aiService.getProvider();

      // PASO 1: Extraer texto
      const extraction = await textExtractionService.extractText(
        document.path,
        document.mimeType
      );
      document.extractedText = extraction.text;

      // PASO 2: Clasificar + Etiquetar
      const classification = await provider.classifyDocument(extraction.text);
      document.aiCategory = classification.confidence >= 0.5 
        ? classification.category 
        : 'Otro';
      document.aiConfidence = classification.confidence;
      document.aiTags = classification.tags;

      // PASO 3: Resumir
      const summary = await provider.summarizeDocument(extraction.text);
      document.aiSummary = summary.summary;
      document.aiKeyPoints = summary.keyPoints;

      // PASO 4: Re-indexar en ES con contenido
      await searchService.updateDocumentIndex(documentId, {
        content: extraction.text,
        aiCategory: document.aiCategory,
        aiTags: document.aiTags,
      });

      // PASO 5: Chunking + Embeddings (para RAG)
      await documentProcessorService.processDocument(
        documentId,
        extraction.text,
        document.organization.toString()
      );

      // Marcar como completado
      document.aiProcessingStatus = 'completed';
      document.aiProcessedAt = new Date();
      document.aiError = null;
      await document.save();

    } catch (error) {
      document.aiProcessingStatus = 'failed';
      document.aiError = error instanceof Error ? error.message : 'Error desconocido';
      await document.save();
      console.error(`AI processing failed for document ${documentId}:`, error);
    }
  }

  /**
   * Re-procesa un documento (ej: tras cambiar de provider o corregir errores).
   */
  async reprocessDocument(documentId: string): Promise<void> {
    const document = await Document.findById(documentId);
    if (!document) throw new Error(`Document ${documentId} not found`);
    
    // Reset estado
    document.aiProcessingStatus = 'pending';
    document.aiError = null;
    await document.save();

    await this.processDocument(documentId);
  }
}

export const aiPipelineService = new AIPipelineService();
```

### Integración en Upload Controller

```typescript
// Modificación en src/controllers/document.controller.ts → upload()

// ... después de crear el documento y indexar en ES ...

// NUEVO: Trigger AI processing en background
if (process.env.AI_ENABLED !== 'false' && process.env.AI_AUTO_PROCESS !== 'false') {
  // Marcar como pending
  document.aiProcessingStatus = 'pending';
  await document.save();
  
  // Lanzar en background (no bloquea la respuesta HTTP)
  setImmediate(async () => {
    try {
      await aiPipelineService.processDocument(document._id.toString());
    } catch (error) {
      console.error('AI pipeline error (background):', error);
    }
  });
}

return res.status(201).json(document);
```

---

## 📡 Endpoints Afectados

### Endpoints existentes que cambian

| Endpoint | Cambio necesario |
|----------|-----------------|
| `POST /api/documents/upload` | Añadir trigger AI pipeline |
| `GET /api/documents/:id` | Ahora devuelve campos AI (automático con Mongoose) |
| `GET /api/documents` | Ahora incluye campos AI en listado |
| `GET /api/search` | Re-indexar con contenido (RFE-AI-004) |

### Endpoints nuevos sugeridos

| Endpoint | Propósito |
|----------|-----------|
| `POST /api/ai/process/:documentId` | Re-procesar un documento manualmente |
| `GET /api/ai/status/:documentId` | Consultar estado de procesamiento |

---

## 🧪 Estrategia de Migración

### Para documentos existentes

Los documentos ya existentes en la base de datos **no se ven afectados**:
- Los nuevos campos tienen `default: null` o `default: 'none'`
- Mongoose maneja la ausencia de campos gracefully
- `aiProcessingStatus: 'none'` indica "nunca procesado"

### Script de migración one-time (opcional)

Para procesar documentos existentes:

```typescript
// scripts/migrate-ai-process.ts
async function migrateExistingDocuments() {
  const docs = await Document.find({ aiProcessingStatus: 'none' });
  console.log(`Procesando ${docs.length} documentos existentes...`);
  
  for (const doc of docs) {
    try {
      await aiPipelineService.processDocument(doc._id.toString());
      console.log(`✅ ${doc.filename}`);
    } catch (error) {
      console.error(`❌ ${doc.filename}: ${error}`);
    }
    // Cooldown para no sobrecargar el LLM
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

---

## ✅ Criterios de Aceptación

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Document model tiene los 9 campos AI descritos | ⬜ |
| 2 | Al subir un documento con AI_ENABLED=true, se dispara pipeline automáticamente | ⬜ |
| 3 | La respuesta HTTP del upload NO se retrasa por el procesamiento AI | ⬜ |
| 4 | El documento creado tiene `aiProcessingStatus: 'pending'` inmediatamente | ⬜ |
| 5 | Tras completar el pipeline, el status cambia a `'completed'` | ⬜ |
| 6 | Si el pipeline falla, status = `'failed'` y `aiError` contiene el mensaje | ⬜ |
| 7 | Con AI_ENABLED=false, el upload funciona como antes (sin campos AI) | ⬜ |
| 8 | Los campos AI se devuelven en GET /api/documents/:id automáticamente | ⬜ |
| 9 | `extractedText` NO se incluye en queries normales (select: false) | ⬜ |
| 10 | Se puede re-procesar un documento via POST /api/ai/process/:id | ⬜ |
| 11 | Documentos existentes mantienen `aiProcessingStatus: 'none'` sin errores | ⬜ |

---

## 📋 Tareas de Implementación

### Fase 1: Modificar Document Model (2h)

- [ ] Añadir los 9 campos AI al schema en `src/models/document.model.ts`
- [ ] Añadir índices compuestos: `{ organization, aiProcessingStatus }`, `{ organization, aiCategory }`, `{ aiTags }`
- [ ] Actualizar tipos TypeScript si hay interfaz IDocument separada
- [ ] Verificar que Mongoose maneja documentos existentes sin errores
- [ ] Test unitario: crear documento con campos AI, verificar defaults

### Fase 2: Crear AI Pipeline Service (3h)

- [ ] Crear `src/services/ai/ai-pipeline.service.ts` con método `processDocument()`
- [ ] Implementar los 5 pasos del pipeline (extract → classify → summarize → index → chunk)
- [ ] Implementar manejo de errores con transitions de estado
- [ ] Implementar `reprocessDocument()` para re-procesamiento manual
- [ ] Tests unitarios del pipeline con MockAIProvider

### Fase 3: Integrar en Upload (2h)

- [ ] Modificar `document.controller.ts` → `upload()` para trigger pipeline async
- [ ] Implementar guarda por `AI_ENABLED` y `AI_AUTO_PROCESS`
- [ ] Verificar que upload retorna inmediatamente (no espera al pipeline)
- [ ] Implementar endpoint `POST /api/ai/process/:documentId` para re-proceso manual
- [ ] Implementar endpoint `GET /api/ai/status/:documentId` para polling de estado

### Fase 4: Testing (1h)

- [ ] Test de integración: upload → verificar aiProcessingStatus transitions
- [ ] Test: upload con AI_ENABLED=false → sin campos AI
- [ ] Test: pipeline falla → status 'failed' + aiError mensaje
- [ ] Test: documentos existentes sin campos AI siguen funcionando

---

## 📁 Archivos Afectados

```
src/models/document.model.ts          ← MODIFICAR: añadir 9 campos AI
src/controllers/document.controller.ts ← MODIFICAR: trigger pipeline post-upload
src/services/ai/ai-pipeline.service.ts ← CREAR: orquestador del pipeline
src/routes/ai.routes.ts               ← MODIFICAR: añadir endpoint process/status
src/controllers/ai.controller.ts      ← MODIFICAR: añadir processDocument, getStatus
```

---

## ⚠️ Consideraciones

### `select: false` en extractedText

El campo `extractedText` puede ser muy grande (>100KB para documentos largos). Con `select: false`:
- No se incluye en `find()`, `findOne()` por defecto
- Para acceder, hacer `.select('+extractedText')` explícitamente
- Esto evita overhead en listados de documentos

### Concurrencia del pipeline

Con `setImmediate()` y `AI_MAX_CONCURRENT`, limitar procesamientos simultáneos:
```typescript
// Semáforo simple para concurrencia
let activeProcesses = 0;
const MAX_CONCURRENT = parseInt(process.env.AI_MAX_CONCURRENT || '2');

async function processDocumentAsync(docId: string) {
  if (activeProcesses >= MAX_CONCURRENT) {
    // Encolar para retry después
    setTimeout(() => processDocumentAsync(docId), 5000);
    return;
  }
  activeProcesses++;
  try {
    await aiPipelineService.processDocument(docId);
  } finally {
    activeProcesses--;
  }
}
```

### Backwards Compatibility

- Los campos nuevos tienen defaults → documentos existentes no se rompen
- API responses incluirán los campos AI (con null/none) → frontends antiguos ignoran campos desconocidos
- ES index no necesita re-mapearse hasta RFE-AI-004

---

## 🔗 RFEs Relacionadas

| RFE | Relación |
|-----|----------|
| RFE-AI-001 | Provee el `aiService` que usa el pipeline |
| RFE-AI-003 | Define la lógica de clasificación que el pipeline llama |
| RFE-AI-004 | La re-indexación en ES tras procesamiento |
| RFE-AI-006 | Extracción OCR que se usa en paso 1 |
| RFE-AI-007 | Resumen que se genera en paso 3 |
