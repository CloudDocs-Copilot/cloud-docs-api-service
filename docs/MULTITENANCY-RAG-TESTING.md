# Tests de Seguridad Multitenancy - Guía Completa

## Resumen

Este documento describe los tests de seguridad implementados para **RFE-AI-005** (fix cross-org data leak) y cómo ejecutar tests de integración completos contra MongoDB Atlas.

## Tests Unitarios (Actuales)

**Ubicación:** `tests/integration/ai/multitenancy-rag.test.ts`

**Estado:** ✅ 11/11 tests pasando

**Lo que verifican:**

1. **Data Integrity** (3 tests):
   - Los chunks creados incluyen `organizationId`
   - Todos los documentos procesados tienen chunks con `organizationId` válido
   - La estructura de datos es correcta

2. **Parameter Validation** (5 tests):
   - `search()` rechaza organizationId vacío o whitespace
   - `searchInDocument()` requiere organizationId
   - `answerQuestion()` valida parámetros
   - `answerQuestionInDocument()` requiere organizationId

3. **Document Processor** (2 tests):
   - `processDocument()` rechaza organizationId vacío
   - Los chunks se crean correctamente con organizationId

4. **Documentation** (1 test):
   - Documenta limitaciones y próximos pasos

## Ejecutar Tests Unitarios

```bash
npm test -- tests/integration/ai/multitenancy-rag.test.ts
```

**Resultado esperado:**
```
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Time:        ~6-7 seconds
```

## Limitación: No puede testearse $vectorSearch en memoria

**Problema:** El operador `$vectorSearch` de MongoDB es específico de Atlas y **NO** está disponible en `mongodb-memory-server`.

**Implicación:** Los tests unitarios actuales NO pueden verificar que las búsquedas vectoriales realmente filtren por organizationId en tiempo de ejecución.

**Lo que SÍ verificamos:**
- ✅ El código pasa organizationId correctamente
- ✅ Los chunks se guardan con organizationId
- ✅ Las validaciones de parámetros funcionan

**Lo que NO podemos verificar sin Atlas:**
- ❌ Búsquedas vectoriales reales con filtros
- ❌ Que $vectorSearch + filtro `{ organizationId: { $eq: org1 } }` funciona
- ❌ Que no hay cross-org data leak en producción

## Tests de Integración contra Atlas Real

### Pre-requisitos

1. **Instancia de MongoDB Atlas** con:
   - Cluster activo (M0 Free Tier funciona)
   - Access configurado (IP Whitelist + Database User)

2. **Índice vectorial** en la colección `document_chunks`:

```javascript
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536, // O 768 según provider
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "organizationId"
    },
    {
      "type": "filter",
      "path": "documentId"
    }
  ]
}
```

3. **Variables de entorno:**

```bash
# .env.test
MONGO_ATLAS_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/clouddocs_test
AI_PROVIDER=mock  # Para tests determinísticos
```

### Test Suite para Atlas (a implementar)

**Ubicación sugerida:** `tests/integration/ai/multitenancy-rag-atlas.test.ts`

**Escenarios a probar:**

```typescript
describe('RAG Multitenancy Security - Atlas Integration', () => {
  describe('Vector Search Cross-Org Isolation', () => {
    it('should NOT return org2 chunks when searching with org1 filter', async () => {
      // Setup: Crear 2 orgs con documentos similares
      // Ejecutar: ragService.search(query, org1Id)
      // Verificar: Todos los chunks retornados tienen organizationId === org1Id
      // Verificar: Ningún chunk de org2 está presente
    });

    it('should NOT return org1 chunks when searching with org2 filter', async () => {
      // Invertir el test anterior
    });

    it('should return empty array for fake organizationId', async () => {
      // Buscar con organizationId que no existe
      // Verificar: []
    });
  });

  describe('RAG Question Answering Isolation', () => {
    it('should answer using ONLY org1 data', async () => {
      // Setup: 2 orgs con documentos que responden la misma pregunta diferente
      // Org1 doc: "Project codename: Alpha"
      // Org2 doc: "Project codename: Beta"
      // Pregunta: "What is the project codename?"
      // Verificar: Respuesta contiene "Alpha", NO contiene "Beta"
      // Verificar: sources solo incluye documentos de org1
    });

    it('should answer using ONLY org2 data', async () => {
      // Invertir el test anterior
    });
  });

  describe('Document-Scoped Search Isolation', () => {
    it('should prevent cross-org document access', async () => {
      // Setup: doc1 pertenece a org1
      // Intentar: ragService.searchInDocument(query, org2Id, doc1Id)
      // Verificar: [] (no resultados porque el filtro incluye organizationId)
    });
  });
});
```

### Ejecución

```bash
# Crear archivo de test
npm test -- tests/integration/ai/multitenancy-rag-atlas.test.ts

# O marcar como @atlas y ejecutar selectivamente
npm run test:atlas
```

### Configuración Jest para Atlas Tests

```javascript
// jest.atlas.config.js
module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/*.atlas.test.ts'],
  testTimeout: 30000, // Atlas tests son más lentos
  setupFilesAfterEnv: ['./tests/setup-atlas.ts']
};
```

```typescript
// tests/setup-atlas.ts
beforeAll(() => {
  if (!process.env.MONGO_ATLAS_URI) {
    throw new Error('MONGO_ATLAS_URI required for Atlas integration tests');
  }
  if (!process.env.MONGO_ATLAS_URI.includes('mongodb+srv://')) {
    throw new Error('MONGO_ATLAS_URI must be a real Atlas connection string');
  }
});
```

## Checklist de Seguridad Multitenancy

Para verificar que RFE-AI-005 está correctamente implementado:

- [x] Campo `organizationId` agregado a `IDocumentChunk`
- [x] DocumentProcessor incluye `organizationId` al crear chunks
- [x] RAGService require `organizationId` en todos los métodos de búsqueda
- [x] Filtro `{ organizationId: { $eq: organizationId } }` en `$vectorSearch`
- [x] AI Controller valida y pasa `organizationId`
- [x] Tests unitarios verifican estructura y validaciones (11/11 ✅)
- [ ] **Índice vectorial en Atlas con campo organizationId filterable**
- [ ] **Tests de integración contra Atlas verifican aislamiento real**
- [ ] **Script de migración ejecutado en producción**
- [ ] **Auditoría de seguridad post-migración**

## Próximos Pasos

1. **Configurar instancia de Atlas de test** para el equipo QA
2. **Crear índice vectorial** con filtros en organizationId y documentId
3. **Implementar tests de integración** Atlas (plantilla arriba)
4. **Ejecutar tests Atlas** antes de cada release
5. **Automatizar en CI/CD** con secrets de Atlas de test
6. **Documentar proceso** de rollback si se detecta leak

## Comandos Útiles

```bash
# Tests unitarios (rápidos, sin Atlas)
npm test -- tests/integration/ai/multitenancy-rag.test.ts

# Tests de integración completos (requiere Atlas)
# TODO: Implementar
npm run test:atlas

# Verificar cobertura de tests de seguridad
npm run test:coverage -- tests/integration/ai/multitenancy-rag.test.ts

# Migrar chunks existentes (una sola vez en producción)
npx ts-node scripts/migrate-add-org-to-chunks.ts
```

## Referencias

- **RFE:** `docs/RFE/RFE-AI-005-FIX-CROSS-ORG-RAG.md`
- **Atlas Vector Search Docs:** https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/
- **Código:**
  - Service: `src/services/ai/rag.service.ts`
  - Processor: `src/services/document-processor.service.ts`
  - Controller: `src/controllers/ai.controller.ts`
  - Types: `src/models/types/ai.types.ts`

---

**Status:** Tests unitarios completos ✅ | Tests Atlas pendientes ⏳
