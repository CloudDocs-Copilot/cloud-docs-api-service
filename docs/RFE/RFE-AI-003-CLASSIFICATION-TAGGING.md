# RFE-AI-003: Servicio de Clasificación Automática + Etiquetado Inteligente

## 📋 Resumen

| Campo                   | Valor                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fecha**               | Febrero 16, 2026                                                                                                                                                   |
| **Estado**              | 📋 Propuesto                                                                                                                                                       |
| **Issues relacionadas** | [#46 (US-201)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/46), [#52 (US-205)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/52) |
| **Épica**               | Inteligencia Artificial (Core MVP)                                                                                                                                 |
| **Prioridad**           | 🟠 Alta (P1 — Core)                                                                                                                                                |
| **Estimación**          | 6h                                                                                                                                                                 |
| **Repositorio**         | `cloud-docs-api-service`                                                                                                                                           |

---

## 🎯 Objetivo

Implementar un servicio que, dado el texto extraído de un documento, utilice el AI Provider (RFE-AI-001) para:

1. **Clasificar** el documento en una categoría predefinida con nivel de confianza
2. **Generar etiquetas** (tags) descriptivas del contenido
3. **Ambos en una sola llamada LLM** — coste incremental cero de tags sobre clasificación

Este servicio es llamado por el AI Pipeline (RFE-AI-002) como paso 2 del procesamiento automático.

---

## 📡 Estado Actual

| Componente                    | Estado                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| Servicio de clasificación     | ❌ No existe en ningún archivo                                           |
| Prompt de clasificación       | ❌ No existe (`prompt.builder.ts` tiene RAG y resumen, no clasificación) |
| Campo `aiCategory` en modelo  | ❌ No existe (ver RFE-AI-002)                                            |
| Campo `aiTags` en modelo      | ❌ No existe (ver RFE-AI-002)                                            |
| Endpoint `/api/ai/categories` | ❌ No existe                                                             |
| Endpoint `/api/ai/tags`       | ❌ No existe                                                             |
| Tests de clasificación        | ❌ No existen                                                            |

---

## 🏗️ Arquitectura

### Posicionamiento en el Pipeline

```text
AI Pipeline (RFE-AI-002)
    │
    ├── PASO 1: Extraer texto (text-extraction.service.ts)
    │        └── "Factura #12345\nFecha: 01/02/2026\nTotal: 1.500,00€..."
    │
    ├── PASO 2: Clasificar + Etiquetar ← ESTA RFE
    │        │
    │        ├── classificationService.classifyAndTag(text)
    │        │        │
    │        │        └── aiService.getProvider().classifyDocument(text)
    │        │                    │
    │        │                    ├── [Ollama] POST /api/generate → llama3.2
    │        │                    └── [OpenAI] chat.completions.create → gpt-4o-mini
    │        │
    │        └── Resultado:
    │             {
    │               category: "Factura",
    │               confidence: 0.92,
    │               tags: ["finanzas", "factura", "2026", "proveedor-X", "IVA"]
    │             }
    │
    ├── PASO 3: Resumir (RFE-AI-007)
    └── PASO 4: Indexar en ES (RFE-AI-004)
```

### Diagrama de Componentes

```text
┌──────────────────────────────────────────────────────────────────┐
│                  Classification Service                           │
│                                                                   │
│  classifyAndTag(text: string): ClassificationResult              │
│  ├── Truncar texto a MAX_TEXT_LENGTH                             │
│  ├── Llamar aiService.getProvider().classifyDocument(truncated)  │
│  ├── Validar resultado (categoría válida, confianza 0-1)        │
│  └── Si confianza < 0.5 → category = 'Otro'                    │
│                                                                   │
│  getCategoriesForOrganization(orgId): AggregatedCategories       │
│  ├── Document.aggregate([{$match: {org}}, {$group: {aiCategory}}])│
│  └── Retorna [{category, count}] ordenado por count              │
│                                                                   │
│  getTagsForOrganization(orgId): AggregatedTags                   │
│  ├── Document.aggregate([{$match: {org}}, {$unwind: '$aiTags'}]) │
│  └── Retorna [{tag, count}] ordenado por count                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📂 Categorías Predefinidas

### Catálogo de Categorías

| ID  | Categoría           | Palabras clave esperadas                               | Color sugerido (frontend) |
| --- | ------------------- | ------------------------------------------------------ | ------------------------- |
| 1   | Factura             | factura, invoice, recibo, cobro, pago, IVA, total      | `#FF6B6B` (rojo)          |
| 2   | Contrato            | contrato, acuerdo, convenio, partes, cláusula          | `#4ECDC4` (teal)          |
| 3   | Informe             | informe, reporte, análisis, estudio, conclusiones      | `#45B7D1` (azul)          |
| 4   | Presentación        | presentación, diapositiva, agenda, objetivo            | `#96CEB4` (verde)         |
| 5   | Correspondencia     | carta, estimado, atentamente, por medio de la presente | `#FFEAA7` (amarillo)      |
| 6   | Manual técnico      | manual, guía, tutorial, instrucciones, configuración   | `#DDA0DD` (púrpura)       |
| 7   | Imagen / Fotografía | (OCR text from images)                                 | `#FFB347` (naranja)       |
| 8   | Hoja de cálculo     | tabla, columna, total, promedio, datos                 | `#87CEEB` (celeste)       |
| 9   | Documento personal  | CV, currículum, DNI, certificado, título               | `#98D8C8` (menta)         |
| 10  | Otro                | (fallback si confianza < 0.5)                          | `#BDC3C7` (gris)          |

### Constante en código

```typescript
// src/services/ai/classification/categories.ts

export const AI_CATEGORIES = [
  'Factura',
  'Contrato',
  'Informe',
  'Presentación',
  'Correspondencia',
  'Manual técnico',
  'Imagen/Fotografía',
  'Hoja de cálculo',
  'Documento personal',
  'Otro'
] as const;

export type AICategory = (typeof AI_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<AICategory, string> = {
  Factura: '#FF6B6B',
  Contrato: '#4ECDC4',
  Informe: '#45B7D1',
  Presentación: '#96CEB4',
  Correspondencia: '#FFEAA7',
  'Manual técnico': '#DDA0DD',
  'Imagen/Fotografía': '#FFB347',
  'Hoja de cálculo': '#87CEEB',
  'Documento personal': '#98D8C8',
  Otro: '#BDC3C7'
};

export const MIN_CONFIDENCE_THRESHOLD = 0.5;
export const MIN_TAGS = 3;
export const MAX_TAGS = 7;
```

---

## 📝 Servicio de Clasificación

### Implementación

```typescript
// src/services/ai/classification/classification.service.ts

import { aiService } from '../ai.service';
import { ClassificationResult } from '../providers/ai-provider.interface';
import {
  AI_CATEGORIES,
  AICategory,
  MIN_CONFIDENCE_THRESHOLD,
  MIN_TAGS,
  MAX_TAGS
} from './categories';
import Document from '../../../models/document.model';
import { Types } from 'mongoose';

export interface AggregatedCategory {
  category: string;
  count: number;
}

export interface AggregatedTag {
  tag: string;
  count: number;
}

class ClassificationService {
  /**
   * Clasifica un documento y genera tags en una sola llamada LLM.
   *
   * @param text Texto extraído del documento
   * @returns Clasificación con categoría, confianza y tags validados
   */
  async classifyAndTag(text: string): Promise<ClassificationResult> {
    if (!text || text.trim().length < 10) {
      return {
        category: 'Otro',
        confidence: 0,
        tags: []
      };
    }

    const provider = aiService.getProvider();
    const result = await provider.classifyDocument(text);

    return this.validateAndNormalize(result);
  }

  /**
   * Obtiene las categorías AI usadas en una organización con conteo.
   */
  async getCategoriesForOrganization(organizationId: string): Promise<AggregatedCategory[]> {
    const results = await Document.aggregate([
      {
        $match: {
          organization: new Types.ObjectId(organizationId),
          aiCategory: { $ne: null },
          aiProcessingStatus: 'completed'
        }
      },
      {
        $group: {
          _id: '$aiCategory',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return results.map(r => ({
      category: r._id,
      count: r.count
    }));
  }

  /**
   * Obtiene los tags AI más frecuentes en una organización con conteo.
   */
  async getTagsForOrganization(
    organizationId: string,
    limit: number = 50
  ): Promise<AggregatedTag[]> {
    const results = await Document.aggregate([
      {
        $match: {
          organization: new Types.ObjectId(organizationId),
          aiTags: { $exists: true, $ne: [] },
          aiProcessingStatus: 'completed'
        }
      },
      { $unwind: '$aiTags' },
      {
        $group: {
          _id: '$aiTags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    return results.map(r => ({
      tag: r._id,
      count: r.count
    }));
  }

  /**
   * Obtiene estadísticas AI de una organización.
   */
  async getAIStats(organizationId: string): Promise<{
    totalProcessed: number;
    totalFailed: number;
    totalPending: number;
    categoryCounts: AggregatedCategory[];
    topTags: AggregatedTag[];
  }> {
    const [statusCounts, categories, tags] = await Promise.all([
      Document.aggregate([
        { $match: { organization: new Types.ObjectId(organizationId) } },
        { $group: { _id: '$aiProcessingStatus', count: { $sum: 1 } } }
      ]),
      this.getCategoriesForOrganization(organizationId),
      this.getTagsForOrganization(organizationId, 20)
    ]);

    const statusMap = Object.fromEntries(statusCounts.map(s => [s._id || 'none', s.count]));

    return {
      totalProcessed: statusMap['completed'] || 0,
      totalFailed: statusMap['failed'] || 0,
      totalPending: (statusMap['pending'] || 0) + (statusMap['processing'] || 0),
      categoryCounts: categories,
      topTags: tags
    };
  }

  // --- Privados ---

  private validateAndNormalize(result: ClassificationResult): ClassificationResult {
    // Validar categoría
    let category = result.category;
    if (!AI_CATEGORIES.includes(category as AICategory)) {
      // Intentar match parcial case-insensitive
      const match = AI_CATEGORIES.find(c => c.toLowerCase() === category.toLowerCase());
      category = match || 'Otro';
    }

    // Validar confianza
    let confidence = Math.min(1, Math.max(0, result.confidence || 0));
    if (confidence < MIN_CONFIDENCE_THRESHOLD) {
      category = 'Otro';
    }

    // Validar tags
    let tags = Array.isArray(result.tags) ? result.tags : [];
    tags = tags
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())
      .slice(0, MAX_TAGS);

    return { category, confidence, tags };
  }
}

export const classificationService = new ClassificationService();
```

---

## 📡 Endpoints Nuevos

### GET /api/ai/categories

Devuelve las categorías AI detectadas en la organización del usuario con conteo.

```typescript
// En ai.controller.ts

async getCategories(req: AuthRequest, res: Response) {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const categories = await classificationService.getCategoriesForOrganization(
      organizationId
    );

    return res.json({ categories, total: categories.length });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching categories' });
  }
}
```

**Response:**

```json
{
  "categories": [
    { "category": "Factura", "count": 12 },
    { "category": "Contrato", "count": 8 },
    { "category": "Informe", "count": 5 },
    { "category": "Otro", "count": 3 }
  ],
  "total": 4
}
```

### GET /api/ai/tags

Devuelve los tags AI más frecuentes en la organización.

```typescript
async getTags(req: AuthRequest, res: Response) {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const tags = await classificationService.getTagsForOrganization(
      organizationId, limit
    );

    return res.json({ tags, total: tags.length });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching tags' });
  }
}
```

**Response:**

```json
{
  "tags": [
    { "tag": "finanzas", "count": 15 },
    { "tag": "2026", "count": 12 },
    { "tag": "proveedor", "count": 8 },
    { "tag": "iva", "count": 7 },
    { "tag": "contrato", "count": 6 }
  ],
  "total": 5
}
```

### GET /api/ai/stats

Devuelve estadísticas generales de IA para la organización.

```typescript
async getStats(req: AuthRequest, res: Response) {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const stats = await classificationService.getAIStats(organizationId);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching AI stats' });
  }
}
```

---

## 🧪 Testing

### Test del Classification Service

```typescript
// tests/unit/services/classification.service.test.ts

describe('ClassificationService', () => {
  describe('classifyAndTag', () => {
    it('should classify an invoice document', async () => {
      const text = 'Factura #12345\nFecha: 01/02/2026\nTotal: 1.500,00€\nIVA: 21%';
      const result = await classificationService.classifyAndTag(text);

      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.tags).toBeInstanceOf(Array);
      expect(result.tags.length).toBeGreaterThanOrEqual(0);
      expect(result.tags.length).toBeLessThanOrEqual(7);
    });

    it('should return "Otro" for very short text', async () => {
      const result = await classificationService.classifyAndTag('ab');
      expect(result.category).toBe('Otro');
      expect(result.confidence).toBe(0);
    });

    it('should return "Otro" if confidence is below threshold', async () => {
      // Con MockAIProvider configurado para devolver baja confianza
      const mockProvider = aiService.getProvider() as MockAIProvider;
      mockProvider.classifyResponse = {
        category: 'Factura',
        confidence: 0.3,
        tags: ['test']
      };

      const result = await classificationService.classifyAndTag('some text');
      expect(result.category).toBe('Otro');
    });

    it('should normalize invalid category to "Otro"', async () => {
      const mockProvider = aiService.getProvider() as MockAIProvider;
      mockProvider.classifyResponse = {
        category: 'CategoríaInválida',
        confidence: 0.9,
        tags: ['test']
      };

      const result = await classificationService.classifyAndTag('some text');
      expect(result.category).toBe('Otro');
    });

    it('should lowercase and trim tags', async () => {
      const mockProvider = aiService.getProvider() as MockAIProvider;
      mockProvider.classifyResponse = {
        category: 'Factura',
        confidence: 0.9,
        tags: [' Finanzas ', 'IVA', '  2026  ']
      };

      const result = await classificationService.classifyAndTag('some text');
      expect(result.tags).toEqual(['finanzas', 'iva', '2026']);
    });

    it('should limit tags to MAX_TAGS', async () => {
      const mockProvider = aiService.getProvider() as MockAIProvider;
      mockProvider.classifyResponse = {
        category: 'Factura',
        confidence: 0.9,
        tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
      };

      const result = await classificationService.classifyAndTag('some text');
      expect(result.tags.length).toBeLessThanOrEqual(7);
    });
  });

  describe('getCategoriesForOrganization', () => {
    it('should aggregate categories with counts', async () => {
      // Requires test DB with seeded documents
      const categories = await classificationService.getCategoriesForOrganization(testOrgId);

      expect(Array.isArray(categories)).toBe(true);
      categories.forEach(c => {
        expect(c).toHaveProperty('category');
        expect(c).toHaveProperty('count');
        expect(typeof c.count).toBe('number');
      });
    });

    it('should sort by count descending', async () => {
      const categories = await classificationService.getCategoriesForOrganization(testOrgId);

      for (let i = 1; i < categories.length; i++) {
        expect(categories[i].count).toBeLessThanOrEqual(categories[i - 1].count);
      }
    });
  });

  describe('getTagsForOrganization', () => {
    it('should aggregate tags with counts', async () => {
      const tags = await classificationService.getTagsForOrganization(testOrgId);

      expect(Array.isArray(tags)).toBe(true);
      tags.forEach(t => {
        expect(t).toHaveProperty('tag');
        expect(t).toHaveProperty('count');
      });
    });

    it('should respect limit parameter', async () => {
      const tags = await classificationService.getTagsForOrganization(testOrgId, 5);

      expect(tags.length).toBeLessThanOrEqual(5);
    });
  });
});
```

### Test de Integración

```typescript
// tests/integration/classification.test.ts

describe('Classification Integration', () => {
  it('should classify and tag through full pipeline', async () => {
    // Upload a document
    const uploadRes = await request(app)
      .post('/api/documents/upload')
      .attach('document', 'tests/fixtures/files/sample-invoice.pdf')
      .set('Authorization', `Bearer ${authToken}`);

    const docId = uploadRes.body._id;

    // Wait for async processing
    await waitForProcessing(docId, 10000);

    // Verify classification
    const doc = await Document.findById(docId);
    expect(doc.aiProcessingStatus).toBe('completed');
    expect(doc.aiCategory).toBeDefined();
    expect(doc.aiConfidence).toBeGreaterThan(0);
    expect(doc.aiTags).toBeInstanceOf(Array);
    expect(doc.aiTags.length).toBeGreaterThan(0);
  });

  it('GET /api/ai/categories returns aggregated data', async () => {
    const res = await request(app)
      .get('/api/ai/categories')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('categories');
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('GET /api/ai/tags returns aggregated data', async () => {
    const res = await request(app).get('/api/ai/tags').set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tags');
    expect(Array.isArray(res.body.tags)).toBe(true);
  });
});
```

---

## ✅ Criterios de Aceptación

| #   | Criterio                                                      | Estado |
| --- | ------------------------------------------------------------- | ------ |
| 1   | `classifyAndTag(text)` devuelve categoría válida del catálogo | ⬜     |
| 2   | Categorías inválidas se normalizan a "Otro"                   | ⬜     |
| 3   | Confianza < 0.5 fuerza categoría "Otro"                       | ⬜     |
| 4   | Tags se normalizan (lowercase, trim, máximo 7)                | ⬜     |
| 5   | Texto vacío o muy corto devuelve "Otro" con confianza 0       | ⬜     |
| 6   | `GET /api/ai/categories` devuelve agregación correcta por org | ⬜     |
| 7   | `GET /api/ai/tags` devuelve top tags con conteo por org       | ⬜     |
| 8   | `GET /api/ai/stats` devuelve estadísticas completas           | ⬜     |
| 9   | El servicio funciona con OllamaProvider (local)               | ⬜     |
| 10  | El servicio funciona con OpenAIProvider (cloud)               | ⬜     |
| 11  | Los tests usan MockAIProvider sin LLM real                    | ⬜     |

---

## 📋 Tareas de Implementación

- [ ] Crear `src/services/ai/classification/categories.ts` — constantes de categorías + colores
- [ ] Crear `src/services/ai/classification/classification.service.ts` — servicio principal
- [ ] Añadir endpoints `GET /api/ai/categories`, `GET /api/ai/tags`, `GET /api/ai/stats` a controller y routes
- [ ] Integrar `classificationService.classifyAndTag()` en el pipeline (RFE-AI-002 paso 2)
- [ ] Tests unitarios del servicio de clasificación (validación, normalización, edge cases)
- [ ] Tests unitarios de las agregaciones MongoDB (categories, tags, stats)
- [ ] Tests de integración de endpoints

---

## 📁 Archivos Nuevos

```text
src/services/ai/classification/
├── categories.ts              ← NUEVO: constantes y tipos de categorías
└── classification.service.ts  ← NUEVO: servicio de clasificación + agregaciones

src/controllers/ai.controller.ts  ← MODIFICAR: añadir getCategories, getTags, getStats
src/routes/ai.routes.ts           ← MODIFICAR: añadir rutas GET
```

---

## 🔗 RFEs Relacionadas

| RFE        | Relación                                                               |
| ---------- | ---------------------------------------------------------------------- |
| RFE-AI-001 | Provee el `AIProvider.classifyDocument()` que este servicio consume    |
| RFE-AI-002 | El pipeline llama a `classificationService.classifyAndTag()` en paso 2 |
| RFE-AI-004 | `aiCategory` y `aiTags` se indexan en ES para filtros de búsqueda      |
