# RFE-AI-005: Fix Cross-Org Data Leakage en RAG + Seguridad de Búsqueda Semántica

## 📋 Resumen

| Campo | Valor |
|-------|-------|
| **Fecha** | Febrero 16, 2026 |
| **Estado** | 📋 Propuesto |
| **Issues relacionadas** | [#51 (US-204)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/51) |
| **Épica** | Inteligencia Artificial (Core MVP) |
| **Prioridad** | 🔴 Crítica (vulnerabilidad de seguridad) |
| **Estimación** | 5h |
| **Repositorio** | `cloud-docs-api-service` |

---

## 🎯 Objetivo

Corregir 4 bugs críticos en el servicio RAG (Retrieval Augmented Generation) que comprometeten la seguridad y fiabilidad de la búsqueda semántica:

1. **Cross-org data leakage**: `$vectorSearch` no filtra por `organizationId` — un usuario puede ver chunks de CUALQUIER organización
2. **Zero-vector fallback**: Si el embedding falla, se pasa un vector de ceros que devuelve resultados aleatorios en vez de error
3. **Hardcoded embedding dimensions**: `rag.service.ts` usa `1536` literal en vez de la constante `EMBEDDING_DIMENSIONS`
4. **Falta de `organizationId` en chunks**: `IDocumentChunk` no almacena la organización

---

## 📡 Estado Actual — Bugs Identificados

### Bug 1: Cross-Org Data Leakage (CRÍTICO)

**Archivo:** `src/services/ai/rag.service.ts`

```typescript
// Código actual — SIN FILTRO DE ORGANIZACIÓN
const pipeline = [
  {
    $vectorSearch: {
      index: 'vector_index',
      path: 'embedding',
      queryVector: embedding,
      numCandidates: 100,
      limit: 5,
      // ❌ NO HAY filter por organizationId
      // Un usuario de org A puede ver documentos de org B y C
    }
  }
];
```

**Impacto:** Cualquier usuario que haga una pregunta a la IA puede recibir fragmentos de documentos de TODAS las organizaciones. Esto viola completamente el modelo multitenancy.

### Bug 2: Zero-Vector Fallback

**Archivo:** `src/services/ai/rag.service.ts`

```typescript
// Código actual — si embedding falla, devuelve vector de ceros
try {
  embedding = await embeddingService.generateEmbedding(question);
} catch (error) {
  // Fallback genérico que devuelve ceros
  embedding = new Array(1536).fill(0);
  // ❌ Un vector de ceros en $vectorSearch devuelve resultados ALEATORIOS
  // No hay error al usuario — recibe respuestas sin sentido
}
```

**Impacto:** Si OpenAI está caído o la API key es inválida, el usuario recibe respuestas basadas en chunks aleatorios en vez de un error claro.

### Bug 3: Hardcoded Dimensions

```typescript
// Múltiples lugares en rag.service.ts
embedding = new Array(1536).fill(0);  // ❌ Hardcoded
//                     ^^^^
// Si se cambia a Ollama (768 dims), esto se rompe silenciosamente
```

**Impacto:** Incompatible con Ollama `nomic-embed-text` (768 dims). Si se cambia de provider sin actualizar hardcodes, la búsqueda vectorial falla o devuelve basura.

### Bug 4: Chunks sin organizationId

```typescript
// ai.types.ts — IDocumentChunk actual
interface IDocumentChunk {
  documentId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: {
    filename: string;
    pageNumber?: number;
    totalChunks: number;
  };
  // ❌ NO tiene organizationId
  // Imposible filtrar por org en $vectorSearch
}
```

---

## 🏗️ Solución Propuesta

### Fix 1: Añadir `organizationId` al chunk model

```typescript
// Modificar src/models/types/ai.types.ts

export interface IDocumentChunk {
  documentId: string;
  organizationId: string;  // ← NUEVO: para filtro de seguridad
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: {
    filename: string;
    pageNumber?: number;
    totalChunks: number;
    organizationId: string;  // ← Redundante pero útil para queries
  };
  createdAt: Date;
}
```

### Fix 2: Propagar organizationId al crear chunks

```typescript
// Modificar src/services/document-processor.service.ts → processDocument()

async processDocument(
  documentId: string,
  text: string,
  organizationId: string  // ← NUEVO parámetro
): Promise<void> {
  const chunks = this.createChunks(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await aiService.getProvider().generateEmbedding(chunks[i]);
    
    await this.documentChunksCollection.insertOne({
      documentId,
      organizationId,   // ← NUEVO
      content: chunks[i],
      embedding: embedding.embedding,
      chunkIndex: i,
      metadata: {
        filename: document.filename,
        totalChunks: chunks.length,
        organizationId,  // ← NUEVO (redundante pero para queries)
      },
      createdAt: new Date(),
    });
  }
}
```

### Fix 3: Filtrar $vectorSearch por organizationId

```typescript
// Modificar src/services/ai/rag.service.ts → searchSimilarChunks()

async searchSimilarChunks(
  question: string,
  organizationId: string,  // ← NUEVO: parámetro obligatorio
  limit: number = 5
): Promise<IDocumentChunk[]> {
  
  // Generar embedding — SIN fallback de ceros
  let embeddingResult;
  try {
    embeddingResult = await aiService.getProvider().generateEmbedding(question);
  } catch (error) {
    // ❌ NO devolver vector de ceros
    // ✅ Propagar error claramente
    throw new Error(
      `No se pudo generar embedding para la búsqueda: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: embeddingResult.embedding,
        numCandidates: 100,
        limit,
        // ✅ NUEVO: Filtro por organización
        filter: {
          organizationId: organizationId,
        },
      },
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        organizationId: 1,
        content: 1,
        chunkIndex: 1,
        metadata: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const chunks = await this.documentChunksCollection
    .aggregate(pipeline)
    .toArray();

  return chunks;
}
```

### Fix 4: Actualizar MongoDB Atlas Vector Search Index

El índice vectorial en Atlas debe actualizarse para soportar filtrado:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 768,
        "similarity": "cosine"
      },
      "organizationId": {
        "type": "filter"
      }
    }
  }
}
```

**IMPORTANTE:** El campo `organizationId` debe estar marcado como `"type": "filter"` en el vector search index definition de Atlas para que `$vectorSearch.filter` funcione. Sin esto, el filtro se ignora silenciosamente.

### Fix 5: Actualizar controller para pasar organizationId

```typescript
// Modificar src/controllers/ai.controller.ts → askQuestion()

async askQuestion(req: AuthRequest, res: Response) {
  try {
    const { question } = req.body;
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // ✅ Pasar organizationId al RAG
    const chunks = await ragService.searchSimilarChunks(
      question,
      organizationId,  // ← NUEVO
      5
    );

    if (chunks.length === 0) {
      return res.json({
        answer: 'No encontré documentos relevantes en tu organización para responder esa pregunta.',
        sources: [],
      });
    }

    // Construir contexto solo con chunks de la org del usuario
    const context = chunks
      .map(c => `[${c.metadata.filename}]\n${c.content}`)
      .join('\n\n---\n\n');

    const result = await aiService.getProvider().answerQuestion(question, context);

    return res.json({
      answer: result.answer,
      sources: chunks.map(c => ({
        documentId: c.documentId,
        filename: c.metadata.filename,
        chunkIndex: c.chunkIndex,
        score: (c as any).score,
      })),
    });
  } catch (error) {
    // ✅ Error claro en vez de respuesta basura
    return res.status(500).json({ 
      error: 'Error al procesar la pregunta',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

### Fix 6: Usar dimensiones del provider, no hardcoded

```typescript
// Eliminar TODOS los hardcoded 1536 y usar constante dinámica

// En ai-provider.types.ts
export function getEmbeddingDimensions(): number {
  const provider = process.env.AI_PROVIDER || 'local';
  switch (provider) {
    case 'local': return 768;   // nomic-embed-text
    case 'openai': return 1536; // text-embedding-3-small
    case 'mock': return 768;    // match local dims
    default: return 768;
  }
}

// O mejor: obtener dinámicamente del provider
// El AIProvider.generateEmbedding() ya retorna { dimensions } en el resultado
```

---

## 🔄 Script de Migración de Chunks Existentes

Los chunks existentes NO tienen `organizationId`. Necesitan migración:

```typescript
// scripts/migrate-chunks-org.ts

import { MongoClient } from 'mongodb';
import Document from '../src/models/document.model';

async function migrateChunksWithOrgId() {
  const client = new MongoClient(process.env.MONGO_ATLAS_URI!);
  await client.connect();
  
  const chunksCollection = client.db('cloud_docs_ia').collection('document_chunks');
  
  // Buscar chunks sin organizationId
  const orphanChunks = await chunksCollection
    .find({ organizationId: { $exists: false } })
    .toArray();
  
  console.log(`Migrando ${orphanChunks.length} chunks...`);
  
  // Agrupar por documentId para reducir queries
  const docIds = [...new Set(orphanChunks.map(c => c.documentId))];
  
  for (const docId of docIds) {
    const doc = await Document.findById(docId).select('organization');
    if (!doc) {
      console.warn(`Doc ${docId} not found — deleting orphan chunks`);
      await chunksCollection.deleteMany({ documentId: docId });
      continue;
    }
    
    const orgId = doc.organization.toString();
    const result = await chunksCollection.updateMany(
      { documentId: docId },
      { $set: { organizationId: orgId, 'metadata.organizationId': orgId } }
    );
    console.log(`✅ Doc ${docId} → org ${orgId}: ${result.modifiedCount} chunks`);
  }
  
  await client.close();
  console.log('Migration complete');
}
```

---

## 🧪 Testing

### Tests de Seguridad

```typescript
describe('RAG Security - Cross-Org Isolation', () => {
  let orgA_token: string;
  let orgB_token: string;
  
  beforeAll(async () => {
    // Crear dos organizaciones con documentos distintos
    orgA_token = await createOrgWithDocument('Org A', 'Contrato de Org A con datos sensibles');
    orgB_token = await createOrgWithDocument('Org B', 'Factura privada de Org B');
    // Esperar procesamiento AI
    await waitForAllProcessing();
  });

  it('should NOT return chunks from other organizations', async () => {
    // User de Org A pregunta algo que está en documentos de Org B
    const res = await request(app)
      .post('/api/ai/ask')
      .send({ question: 'Factura privada de Org B' })
      .set('Authorization', `Bearer ${orgA_token}`);

    expect(res.status).toBe(200);
    // No debe encontrar el documento de Org B
    expect(res.body.sources.every(
      (s: any) => !s.filename.includes('Org B')
    )).toBe(true);
  });

  it('should return error instead of random results on embedding failure', async () => {
    // Simular fallo de embedding
    const mockProvider = aiService.getProvider() as MockAIProvider;
    const original = mockProvider.generateEmbedding.bind(mockProvider);
    mockProvider.generateEmbedding = async () => { throw new Error('API down'); };

    const res = await request(app)
      .post('/api/ai/ask')
      .send({ question: 'cualquier cosa' })
      .set('Authorization', `Bearer ${orgA_token}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Error al procesar');

    // Restaurar
    mockProvider.generateEmbedding = original;
  });

  it('should correctly filter chunks by organization in vector search', async () => {
    // Búsqueda directa de chunks para Org A
    const chunks = await ragService.searchSimilarChunks(
      'contrato datos',
      orgA_id,
      10
    );

    chunks.forEach(chunk => {
      expect(chunk.organizationId).toBe(orgA_id);
    });
  });
});
```

### Test de dimensiones

```typescript
describe('Embedding Dimensions', () => {
  it('should not use hardcoded 1536 anywhere', async () => {
    // grep test: no debe quedar 1536 hardcoded en rag.service.ts
    const ragCode = fs.readFileSync('src/services/ai/rag.service.ts', 'utf-8');
    expect(ragCode).not.toContain('new Array(1536)');
    expect(ragCode).not.toContain('.fill(0)'); // No zero-vector fallback
  });
});
```

---

## ✅ Criterios de Aceptación

| # | Criterio | Estado |
|---|----------|--------|
| 1 | `$vectorSearch` filtra por `organizationId` | ⬜ |
| 2 | `IDocumentChunk` incluye campo `organizationId` | ⬜ |
| 3 | Chunks nuevos se crean con `organizationId` del documento padre | ⬜ |
| 4 | Script migra chunks existentes añadiendo `organizationId` | ⬜ |
| 5 | Si embedding falla, se retorna error (no vector de ceros) | ⬜ |
| 6 | No queda `1536` hardcoded — se usa dimensión del provider o constante | ⬜ |
| 7 | Vector search index en Atlas incluye `organizationId` como filter | ⬜ |
| 8 | Test de seguridad cross-org pasa | ⬜ |
| 9 | Test de fallo de embedding pasa (error, no basura) | ⬜ |

---

## 📋 Tareas de Implementación

- [ ] Añadir `organizationId` a `IDocumentChunk` y al schema real del chunk
- [ ] Modificar `document-processor.service.ts` para guardar `organizationId` en chunks
- [ ] Modificar `rag.service.ts`: añadir `filter: { organizationId }` en `$vectorSearch`
- [ ] Eliminar zero-vector fallback: propagar error en vez de `new Array(1536).fill(0)`
- [ ] Reemplazar `1536` hardcoded por dimensión dinámica del provider
- [ ] Actualizar `ai.controller.ts` para pasar `organizationId` a RAG
- [ ] Actualizar vector search index en Atlas con campo filter `organizationId`
- [ ] Crear script `scripts/migrate-chunks-org.ts` para chunks existentes
- [ ] Tests de seguridad cross-org isolation
- [ ] Tests de embedding failure handling

---

## 📁 Archivos Afectados

```
src/models/types/ai.types.ts                    ← MODIFICAR: añadir organizationId
src/services/ai/rag.service.ts                   ← MODIFICAR: filter, eliminar zero-vector
src/services/document-processor.service.ts       ← MODIFICAR: guardar organizationId en chunks
src/controllers/ai.controller.ts                 ← MODIFICAR: pasar organizationId
scripts/migrate-chunks-org.ts                    ← CREAR: migración de chunks existentes
```

---

## 🔗 RFEs Relacionadas

| RFE | Relación |
|-----|----------|
| RFE-AI-001 | Provee `generateEmbedding()` con dimensiones correctas del provider |
| RFE-AI-002 | El pipeline pasa `organizationId` al crear chunks |
