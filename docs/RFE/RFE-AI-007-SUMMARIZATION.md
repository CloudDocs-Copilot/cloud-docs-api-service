# RFE-AI-007: Endpoint de Resumen Automático (Summarization)

## 📋 Resumen

| Campo                   | Valor                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Fecha**               | Febrero 16, 2026                                                                 |
| **Estado**              | 📋 Propuesto                                                                     |
| **Issues relacionadas** | [#48 (US-203)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/48) |
| **Épica**               | Inteligencia Artificial (Core MVP)                                               |
| **Prioridad**           | 🟡 Media (P2 — UX, no bloqueante)                                                |
| **Estimación**          | 3h                                                                               |
| **Repositorio**         | `cloud-docs-api-service`                                                         |

---

## 🎯 Objetivo

1. Conectar el prompt de resumen existente (ya definido en `prompt.builder.ts` pero **nunca usado**) al AI Provider
2. Crear endpoint dedicado para obtener/regenerar resumen de un documento
3. El resumen principal se genera automáticamente en el pipeline (RFE-AI-002 paso 3), pero el endpoint permite regenerar bajo demanda

---

## 📡 Estado Actual

### Prompt de resumen existente

```typescript
// prompt.builder.ts — buildSummarizationPrompt() ya existe
// PERO nunca se llama desde ningún controller, servicio, ni ruta
```

El prompt existe en el código pero está completamente desconectado. Nadie lo usa.

### Campos en Document Model

Con RFE-AI-002, el modelo ya tendrá:

- `aiSummary: String` — resumen de 2-3 frases
- `aiKeyPoints: [String]` — 3-5 puntos clave

### AI Provider

Con RFE-AI-001, el provider ya expone:

- `summarizeDocument(text): Promise<SummarizationResult>` — devuelve `{ summary, keyPoints }`

---

## 🏗️ Solución Propuesta

### Integración en Pipeline (ya cubierta por RFE-AI-002)

El pipeline ya llama `provider.summarizeDocument()` en paso 3. Aquí solo necesitamos:

1. Un endpoint para **consultar** el resumen existente
2. Un endpoint para **regenerar** el resumen bajo demanda

### Endpoint: GET /api/ai/documents/:documentId/summary

Devuelve el resumen almacenado (sin re-procesar).

```typescript
// Añadir a ai.controller.ts

async getDocumentSummary(req: AuthRequest, res: Response) {
  try {
    const { documentId } = req.params;
    const organizationId = req.user?.organizationId;

    const document = await Document.findOne({
      _id: documentId,
      organization: organizationId,  // Seguridad: solo docs de su org
    }).select('aiSummary aiKeyPoints aiProcessingStatus aiCategory aiTags aiConfidence');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.aiProcessingStatus === 'none') {
      return res.json({
        status: 'not_processed',
        summary: null,
        keyPoints: [],
        message: 'Este documento no ha sido procesado por IA.',
      });
    }

    if (document.aiProcessingStatus === 'pending' || document.aiProcessingStatus === 'processing') {
      return res.json({
        status: 'processing',
        summary: null,
        keyPoints: [],
        message: 'El documento se está procesando. Intenta de nuevo en unos segundos.',
      });
    }

    if (document.aiProcessingStatus === 'failed') {
      return res.json({
        status: 'failed',
        summary: null,
        keyPoints: [],
        message: 'El procesamiento del documento falló.',
      });
    }

    return res.json({
      status: 'completed',
      summary: document.aiSummary,
      keyPoints: document.aiKeyPoints || [],
      category: document.aiCategory,
      confidence: document.aiConfidence,
      tags: document.aiTags || [],
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching document summary' });
  }
}
```

### Endpoint: POST /api/ai/documents/:documentId/summarize

Regenera el resumen (útil si el usuario quiere actualizar tras cambiar de provider o si el primer intento falló).

```typescript
async regenerateSummary(req: AuthRequest, res: Response) {
  try {
    const { documentId } = req.params;
    const organizationId = req.user?.organizationId;

    const document = await Document.findOne({
      _id: documentId,
      organization: organizationId,
    }).select('+extractedText aiProcessingStatus');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verificar que hay texto extraído
    if (!document.extractedText || document.extractedText.trim().length < 10) {
      return res.status(400).json({
        error: 'El documento no tiene texto extraído. Necesita re-procesamiento completo.',
        suggestion: 'POST /api/ai/process/' + documentId,
      });
    }

    // Verificar que AI está habilitado
    if (!aiService.isEnabled()) {
      return res.status(503).json({ error: 'AI processing is disabled' });
    }

    // Generar nuevo resumen
    const provider = aiService.getProvider();
    const result = await provider.summarizeDocument(document.extractedText);

    // Actualizar documento
    document.aiSummary = result.summary;
    document.aiKeyPoints = result.keyPoints;
    await document.save();

    return res.json({
      status: 'completed',
      summary: result.summary,
      keyPoints: result.keyPoints,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error generating summary' });
  }
}
```

### Rutas

```typescript
// Añadir a ai.routes.ts

router.get('/documents/:documentId/summary', authMiddleware, aiController.getDocumentSummary);

router.post(
  '/documents/:documentId/summarize',
  authMiddleware,
  rateLimitMiddleware({ windowMs: 60000, max: 10 }), // 10 por minuto
  aiController.regenerateSummary
);
```

---

## 🔄 Flujo del Resumen

### Resumen Automático (via Pipeline)

```text
Upload documento
    │
    └→ AI Pipeline (RFE-AI-002)
        │
        ├── Paso 1: Extraer texto
        ├── Paso 2: Clasificar + tags
        ├── Paso 3: Resumir ← AQUÍ
        │       │
        │       ├── provider.summarizeDocument(extractedText)
        │       │
        │       └── Guardar en document:
        │            document.aiSummary = "Factura de servicios..."
        │            document.aiKeyPoints = [
        │              "Factura #12345 del proveedor X",
        │              "Total: 1.500,00€ con IVA incluido",
        │              "Fecha de vencimiento: 01/03/2026"
        │            ]
        │
        ├── Paso 4: Indexar en ES
        └── Paso 5: Embeddings

Frontend:
    GET /api/documents/:id → incluye aiSummary, aiKeyPoints
    GET /api/ai/documents/:id/summary → devuelve resumen + metadata
```

### Resumen Manual (bajo demanda)

```text
Usuario ve resumen antiguo o fallido
    │
    └→ POST /api/ai/documents/:id/summarize
        │
        ├── Leer extractedText del documento
        ├── provider.summarizeDocument(text)
        ├── Actualizar document.aiSummary + aiKeyPoints
        └── Retornar nuevo resumen
```

---

## 🧪 Testing

```typescript
describe('Summarization', () => {
  describe('GET /api/ai/documents/:id/summary', () => {
    it('should return summary for processed document', async () => {
      // Crear documento con resumen (via seed o pipeline)
      const doc = await createProcessedDocument(authToken);

      const res = await request(app)
        .get(`/api/ai/documents/${doc._id}/summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.summary).toBeDefined();
      expect(res.body.keyPoints).toBeInstanceOf(Array);
    });

    it('should return not_processed for unprocessed document', async () => {
      const doc = await createUnprocessedDocument(authToken);

      const res = await request(app)
        .get(`/api/ai/documents/${doc._id}/summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.body.status).toBe('not_processed');
      expect(res.body.summary).toBeNull();
    });

    it('should return 404 for document of another org', async () => {
      const otherOrgDoc = await createDocumentInOtherOrg();

      const res = await request(app)
        .get(`/api/ai/documents/${otherOrgDoc._id}/summary`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/ai/documents/:id/summarize', () => {
    it('should regenerate summary', async () => {
      const doc = await createProcessedDocument(authToken);

      const res = await request(app)
        .post(`/api/ai/documents/${doc._id}/summarize`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.keyPoints).toBeInstanceOf(Array);
    });

    it('should fail for document without extracted text', async () => {
      const doc = await createDocumentWithoutText(authToken);

      const res = await request(app)
        .post(`/api/ai/documents/${doc._id}/summarize`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
    });

    it('should be rate limited', async () => {
      const doc = await createProcessedDocument(authToken);

      // Hacer 11 requests rápidas
      const requests = Array(11)
        .fill(null)
        .map(() =>
          request(app)
            .post(`/api/ai/documents/${doc._id}/summarize`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(requests);
      const rateLimited = results.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
```

---

## ✅ Criterios de Aceptación

| #   | Criterio                                                                  | Estado |
| --- | ------------------------------------------------------------------------- | ------ |
| 1   | GET /api/ai/documents/:id/summary devuelve resumen + keyPoints + metadata | ⬜     |
| 2   | Devuelve estado correcto: not_processed, processing, completed, failed    | ⬜     |
| 3   | POST /api/ai/documents/:id/summarize regenera el resumen                  | ⬜     |
| 4   | Filtro de organización: no se puede ver resumen de otro org               | ⬜     |
| 5   | Rate limit en endpoint de regeneración (10/min)                           | ⬜     |
| 6   | El resumen se genera automáticamente en el pipeline (paso 3)              | ⬜     |
| 7   | Si no hay texto extraído, POST devuelve 400 con sugerencia                | ⬜     |
| 8   | Si IA está deshabilitada, POST devuelve 503                               | ⬜     |

---

## 📋 Tareas de Implementación

- [ ] Añadir método `getDocumentSummary` en `ai.controller.ts`
- [ ] Añadir método `regenerateSummary` en `ai.controller.ts`
- [ ] Registrar rutas GET y POST en `ai.routes.ts` con auth + rate limit
- [ ] Verificar que pipeline (RFE-AI-002) llama a `summarizeDocument()` en paso 3
- [ ] Tests: GET resumen existente | GET doc no procesado | GET doc de otra org | POST regenerar | POST sin texto | Rate limit

---

## 📁 Archivos Afectados

```text
src/controllers/ai.controller.ts  ← MODIFICAR: añadir getDocumentSummary, regenerateSummary
src/routes/ai.routes.ts           ← MODIFICAR: añadir rutas GET y POST
```

---

## 🔗 RFEs Relacionadas

| RFE        | Relación                                             |
| ---------- | ---------------------------------------------------- |
| RFE-AI-001 | Provee `provider.summarizeDocument()`                |
| RFE-AI-002 | El pipeline genera resumen automáticamente en paso 3 |
