# RFE: Limpieza Automática de Documentos Huérfanos

**ID:** RFE-ORPHAN-CLEANUP  
**Fecha:** 2026-03-03  
**Prioridad:** ALTA  
**Estado:** PROPUESTO  

## 📋 Problema Identificado

Actualmente, el sistema NO valida que los archivos físicos existan antes de devolver resultados de búsqueda, lo que puede causar:

1. ❌ Resultados de búsqueda que apuntan a archivos inexistentes
2. ❌ Error 404 al intentar previsualizar documentos
3. ❌ Experiencia de usuario confusa y degradada
4. ❌ Registros huérfanos en MongoDB + ElasticSearch

### Escenarios que causan el problema:

- **Desarrollo:** `git pull` vacía `storage/` pero conserva MongoDB/ES
- **Producción:** Fallo en volumen Docker, pérdida de datos, migración incorrecta
- **Manual:** Eliminación accidental de archivos en `storage/`

---

## 🎯 Objetivo

Implementar validaciones y limpieza automática para que:
- ✅ Usuario NUNCA vea documentos que no puede acceder
- ✅ Sistema auto-repare inconsistencias
- ✅ Logs claros para debugging

---

## 🏗️ Soluciones Propuestas

### 1. **Validación en Search Service** (CRÍTICO)

**Archivo:** `src/services/search.service.ts`

**Cambio:** Filtrar resultados de ElasticSearch verificando existencia física

```typescript
// DESPUÉS de obtener resultados de ES, ANTES de devolverlos
import fs from 'fs/promises';
import path from 'path';

export async function searchDocuments(params: SearchParams): Promise<SearchResult> {
  // ... búsqueda en ES existente ...

  // NUEVA VALIDACIÓN: Filtrar documentos sin archivo físico
  const validDocuments = [];
  const orphanedIds = [];

  for (const doc of documents) {
    const filePath = path.join(process.cwd(), 'storage', doc.path as string);
    
    try {
      await fs.access(filePath); // Verifica existencia
      validDocuments.push(doc);
    } catch {
      // Archivo no existe - registrar para limpieza
      orphanedIds.push(doc.id);
      console.warn(`[ORPHAN] Document ${doc.id} has no physical file: ${filePath}`);
    }
  }

  // Limpieza asíncrona de huérfanos (no bloquea respuesta)
  if (orphanedIds.length > 0) {
    void cleanupOrphanedDocuments(orphanedIds);
  }

  return {
    documents: validDocuments,
    total: validDocuments.length,
    took: result.took
  };
}
```

**Impacto:**
- ✅ Usuario SOLO ve documentos accesibles
- ✅ Limpieza automática de registros huérfanos
- ✅ Sin cambios en la API externa

---

### 2. **Función de Limpieza de Huérfanos**

**Archivo:** `src/services/orphan-cleanup.service.ts` (NUEVO)

```typescript
import { Document } from '../models/document.model';
import { deleteDocumentFromIndex } from './search.service';

/**
 * Limpia registros de documentos sin archivo físico
 * Se ejecuta asíncronamente para no bloquear requests
 */
export async function cleanupOrphanedDocuments(documentIds: string[]): Promise<void> {
  try {
    console.warn(`[CLEANUP] Starting cleanup of ${documentIds.length} orphaned documents`);

    // 1. Eliminar de MongoDB
    const deleteResult = await Document.deleteMany({
      _id: { $in: documentIds }
    });

    // 2. Eliminar de ElasticSearch
    for (const id of documentIds) {
      await deleteDocumentFromIndex(id).catch(err => 
        console.error(`[CLEANUP] Failed to delete ${id} from ES:`, err)
      );
    }

    console.warn(`[CLEANUP] Cleaned ${deleteResult.deletedCount} orphaned documents`);
  } catch (error) {
    console.error('[CLEANUP] Error during cleanup:', error);
  }
}
```

**Impacto:**
- ✅ Auto-limpieza transparente
- ✅ Mantiene MongoDB y ES sincronizados
- ✅ No bloquea requests de usuario

---

### 3. **Job Nocturno de Verificación** (RECOMENDADO)

**Archivo:** `src/jobs/verify-storage-integrity.job.ts` (NUEVO)

```typescript
import cron from 'node-cron';
import { Document } from '../models/document.model';
import fs from 'fs/promises';
import path from 'path';

/**
 * Job que se ejecuta diariamente a las 3 AM
 * Verifica integridad de storage/ vs MongoDB
 */
export function startStorageIntegrityJob(): void {
  // Ejecutar todos los días a las 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.warn('[INTEGRITY-JOB] Starting storage integrity check...');

    try {
      const documents = await Document.find({}).lean();
      let orphanCount = 0;

      for (const doc of documents) {
        const filePath = path.join(process.cwd(), 'storage', doc.path);

        try {
          await fs.access(filePath);
        } catch {
          // Archivo no existe - marcar para eliminación
          console.warn(`[INTEGRITY-JOB] Orphan found: ${doc._id} -> ${filePath}`);
          await Document.deleteOne({ _id: doc._id });
          orphanCount++;
        }
      }

      console.warn(`[INTEGRITY-JOB] Completed. Cleaned ${orphanCount} orphans.`);
    } catch (error) {
      console.error('[INTEGRITY-JOB] Error:', error);
    }
  });

  console.log('✅ Storage integrity job scheduled (daily at 3 AM)');
}
```

**Activación:** `src/app.ts`

```typescript
import { startStorageIntegrityJob } from './jobs/verify-storage-integrity.job';

// Después de conectar a MongoDB
startStorageIntegrityJob();
```

**Impacto:**
- ✅ Limpieza preventiva diaria
- ✅ Detecta problemas antes que el usuario
- ✅ Logs para auditoría

---

### 4. **Validación en Preview Endpoint**

**Archivo:** `src/controllers/document.controller.ts`

**Cambio:** Verificar existencia antes de servir archivo

```typescript
export const preview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const document = await Document.findById(id);

    if (!document) {
      throw new HttpError(404, 'Document not found');
    }

    const filePath = path.join(storageRoot, document.path);

    // NUEVA VALIDACIÓN: Verificar existencia física
    try {
      await fs.access(filePath);
    } catch {
      // Archivo no existe - limpiar registro y retornar error amigable
      await Document.deleteOne({ _id: id });
      console.warn(`[PREVIEW] Orphan document cleaned: ${id}`);
      
      throw new HttpError(404, 'File not found. The document may have been deleted.');
    }

    // Servir archivo...
  } catch (error) {
    next(error);
  }
};
```

**Impacto:**
- ✅ Usuario recibe mensaje claro
- ✅ Auto-limpieza en punto de acceso
- ✅ Sin crashes del servidor

---

## 📊 Plan de Implementación

### Fase 1: Validaciones Críticas (Sprint actual)
- [ ] Implementar validación en `searchDocuments()`
- [ ] Crear `orphan-cleanup.service.ts`
- [ ] Validación en endpoint `preview`
- [ ] Tests unitarios

### Fase 2: Automatización (Siguiente sprint)
- [ ] Job nocturno de integridad
- [ ] Dashboard de métricas de limpieza
- [ ] Alertas para admin

### Fase 3: Producción (Pre-deploy)
- [ ] Configurar volúmenes Docker persistentes
- [ ] Script de backup de `storage/`
- [ ] Documentación de restore

---

## 🧪 Testing

### Test Cases:

1. **Documento huérfano en búsqueda:**
   - Setup: Crear doc en MongoDB pero NO en storage
   - Acción: Buscar documento
   - Esperado: NO aparece en resultados, limpieza automática

2. **Preview de documento huérfano:**
   - Setup: Crear doc en MongoDB pero NO en storage
   - Acción: GET `/api/documents/:id/preview`
   - Esperado: 404 con mensaje claro, registro eliminado

3. **Job de integridad:**
   - Setup: 10 docs en MongoDB, 5 sin archivo físico
   - Acción: Ejecutar job manualmente
   - Esperado: 5 registros eliminados, logs correctos

---

## 📈 Métricas de Éxito

- ✅ 0 errores 404 en búsqueda de documentos
- ✅ Tiempo de auto-limpieza < 1s
- ✅ Logs claros para debugging
- ✅ Reducción de tickets de soporte relacionados

---

## 🚨 Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Job consume muchos recursos | Ejecutar en horarios de bajo tráfico (3 AM) |
| Eliminación accidental | Logs detallados + opción de "papelera" |
| Overhead en búsquedas | Validación asíncrona, cache de resultados |

---

## 📝 Notas

- Este problema fue identificado durante validación de US-104
- La limpieza manual NO es aceptable para usuarios finales
- Debe implementarse ANTES de producción
- Considerar implementar "soft delete" para recovery

---

## ✅ Criterios de Aceptación

- [ ] Usuario NUNCA ve documentos inaccesibles
- [ ] Usuario NUNCA ejecuta comandos manuales de limpieza
- [ ] Sistema auto-repara inconsistencias
- [ ] Logs claros para debugging
- [ ] Tests E2E pasan
- [ ] Documentación actualizada
