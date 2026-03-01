# 🔍 Configuración de Índice Vectorial en MongoDB Atlas

**Documento:** Guía de configuración del índice vectorial según AI Provider

**Fecha:** Febrero 2026

**Versión:** 1.0

---

## 📋 Tabla de Contenidos

1. [¿Por qué es necesario cambiar el índice?](#por-que-es-necesario-cambiar-el-indice)
2. [Configuración para Ollama (768 dims)](#configuracion-para-ollama-768-dims)
3. [Configuración para OpenAI (1536 dims)](#configuracion-para-openai-1536-dims)
4. [Cómo cambiar de proveedor](#como-cambiar-de-proveedor)
5. [Troubleshooting](#troubleshooting)

---

## ❓ ¿Por qué es necesario cambiar el índice? {#por-que-es-necesario-cambiar-el-indice}

### Justificación Técnica

Los **embeddings vectoriales** son representaciones numéricas de texto en un espacio multidimensional. Cada proveedor de IA utiliza modelos diferentes que generan vectores con **dimensiones específicas**:

| Provider   | Modelo de Embeddings    | Dimensiones |
|------------|-------------------------|-------------|
| **Ollama** | `nomic-embed-text`      | **768**     |
| **OpenAI** | `text-embedding-3-small`| **1536**    |

### ¿Qué pasa si las dimensiones no coinciden?

#### Escenario 1: Índice con 1536 dims, embeddings de 768 dims (Ollama)

```text
❌ Vector search returns 0 results
```

**Causa:** MongoDB Atlas rechaza vectores que no coincidan con `numDimensions` del índice.

#### Escenario 2: Índice con 768 dims, embeddings de 1536 dims (OpenAI)

```text
❌ Error: Invalid embedding dimensions
```

**Causa:** El índice espera 768 números, pero recibe 1536.

### Conclusión

**El índice vectorial en Atlas DEBE estar configurado con las mismas dimensiones que genera el provider activo.**

## ⚙️ Configuración de la aplicación (`.env`)

La aplicación permite configurar el nombre del índice de búsqueda vectorial mediante la variable de entorno `MONGO_ATLAS_VECTOR_INDEX`. Si no se define, el valor por defecto es `default`.

Ejemplo en tu `.env`:

```env
# Nombre del índice Search en MongoDB Atlas (por ejemplo: "vector_index")
MONGO_ATLAS_VECTOR_INDEX=vector_index

# (Opcional) Solo como referencia: dimensiones esperadas por el provider
# MONGO_ATLAS_VECTOR_NUM_DIMENSIONS=768
```

Asegúrate de reiniciar el servidor después de cambiar `.env` para que la variable sea tomada por la aplicación.

---

## 🛠️ Configuración actual (Entorno local — Ollama)

Estas son las configuraciones que el proyecto usa actualmente en desarrollo con Ollama ejecutándose localmente. Aplica para el entorno local y facilita reproducir el entorno que estamos usando para pruebas y desarrollo.

| Variable                            | Valor recomendado / actual | Comentario                                             |
|-------------------------------------|----------------------------|--------------------------------------------------------|
| `AI_PROVIDER`                       | `ollama`                   | Provider local usado en desarrollo                     |
| `OLLAMA_CHAT_MODEL`                 | `llama3.2:1b`              | Modelo de chat activo (CPU-friendly)                   |
| `OLLAMA_EMBEDDING_MODEL`            | `nomic-embed-text`         | Embeddings (768 dimensiones)                           |
| `MONGO_ATLAS_VECTOR_INDEX`          | `vector_index`             | Nombre del índice Search en Atlas (ver screenshot)     |
| `MONGO_ATLAS_VECTOR_NUM_DIMENSIONS` | `768`                      | Debe coincidir con `nomic-embed-text`                  |
| `CHUNK_CONFIG.TARGET_WORDS`         | `100`                      | Configuración aplicada en `src/utils/chunking.util.ts` |
| `CHUNK_CONFIG.MAX_WORDS`            | `150`                      | Límite máximo de palabras por chunk                    |

Notas:

- En este entorno se usa `OLLAMA_CHAT_MODEL=llama3.2:1b` para reducir latencia en CPU. En hardware modesto las respuestas suelen tardar entre 5–12s una vez el modelo está en memoria.
- Si cambias `AI_PROVIDER` a `openai`, sigue la sección "Cómo cambiar de proveedor" y reprocesa los chunks.

---

## 🦙 Configuración para Ollama (768 dims) {#configuracion-para-ollama-768-dims}

### Pre-requisitos

```bash
# En tu .env
AI_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Pasos en MongoDB Atlas

1. **Abre MongoDB Atlas:** [MongoDB Atlas](https://cloud.mongodb.com)
2. **Selecciona tu cluster:** `TFM-CDC-Cluster`
3. **Ve a la pestaña "Search"** (o "Atlas Search")

#### Si NO tienes índice vectorial

1. Click **"Create Search Index"**
2. Selecciona **"JSON Editor"**
3. Configuración:
   - **Index Name:** `default`
   - **Database:** `cloud_docs_ia`
   - **Collection:** `document_chunks`

4. **Pega esta configuración JSON:**

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
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

1. Click **"Create Search Index"**
2. **Espera 2-5 minutos** hasta que el status sea **"Active"**

#### Si YA tienes un índice (1536 dims)

**IMPORTANTE:** No puedes modificar `numDimensions` de un índice existente. Debes eliminarlo y recrearlo.

1. Click en el índice `default` existente
2. Click **"Delete Index"** (⚠️ Esto NO elimina tus chunks, solo el índice)
3. Confirma la eliminación
4. Sigue los pasos de "Si NO tienes índice vectorial" arriba

---

## 🤖 Configuración para OpenAI (1536 dims) {#configuracion-para-openai-1536-dims}

### Pre-requisitos **

```bash
# En tu .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
```

### Pasos en MongoDB Atlas **

Sigue los mismos pasos que para Ollama, pero usa esta configuración JSON:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
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

**Diferencia clave:** `"numDimensions": 1536` en lugar de `768`.

---

## 🔄 Cómo cambiar de proveedor {#como-cambiar-de-proveedor}

### Escenario: Cambiar de Ollama → OpenAI

#### Paso 1: Actualizar `.env`

```bash
# Cambiar de:
AI_PROVIDER=ollama

# A:
AI_PROVIDER=openai
```

#### Paso 2: Eliminar y recrear índice en Atlas

1. MongoDB Atlas → Search → Índice `default`
2. **Delete Index**
3. **Create Search Index** con configuración de **1536 dims** (ver arriba)
4. Esperar a que esté **Active**

#### Paso 3: Reprocesar TODOS los documentos

⚠️ **CRÍTICO:** Los embeddings de Ollama (768) NO son compatibles con OpenAI (1536).

**Debes reprocesar cada documento:**

```bash
# Para cada documento en tu sistema:
POST /api/ai/documents/{documentId}/extract-text
POST /api/ai/documents/{documentId}/process
```

O ejecuta el script de reprocesamiento masivo:

```bash
npm run reprocess:all-documents
```

#### Paso 4: Verificar con diagnóstico

```bash
npx ts-node scripts/diagnose-rag.ts
```

Debería mostrar:

```s
✅ BÚSQUEDA EXITOSA: X resultados encontrados
```

---

### Escenario: Cambiar de OpenAI → Ollama

Sigue los mismos pasos, pero:

- Índice con **768 dims**
- Reprocesar todos los documentos

---

## 🛠️ Troubleshooting {#troubleshooting}

### Problema: "Vector search returns 0 results"

**Causas posibles:**

1. **Índice no existe**
   - Solución: Crear índice según sección correspondiente

2. **Dimensiones incorrectas**
   - Solución: Verificar con `npx ts-node scripts/diagnose-rag.ts`
   - Si no coinciden, eliminar y recrear índice

3. **Índice en construcción**
   - Atlas muestra status "Building..."
   - Solución: Esperar 2-5 minutos

4. **Chunks sin organizationId**
   - Solución: Ejecutar `node scripts/migrate-add-org-to-chunks.ts`

### Problema: "Index name 'default' already exists"

**Solución:**

1. Elimina el índice existente primero
2. Crea el nuevo con la configuración correcta

### Problema: Cambié de provider pero RAG sigue sin funcionar

**Checklist obligatorio:**

- [ ] ✅ Actualizar `AI_PROVIDER` en `.env`
- [ ] ✅ Reiniciar servidor (importante para cargar nueva config)
- [ ] ✅ Eliminar índice antiguo en Atlas
- [ ] ✅ Crear índice nuevo con dimensiones correctas
- [ ] ✅ Esperar a que índice esté **Active** (2-5 min)
- [ ] ✅ Reprocesar TODOS los documentos existentes
- [ ] ✅ Ejecutar diagnóstico para confirmar

### Problema: "Cannot change numDimensions of existing index"

**Explicación:**  
MongoDB Atlas NO permite modificar el número de dimensiones de un índice existente.

**Solución:**  
Debes **eliminar** el índice y **crear uno nuevo** con las dimensiones correctas.

⚠️ Eliminar el índice NO elimina tus chunks en la colección `document_chunks`.

---

## 📊 Resumen de Configuraciones

| Aspecto                    | Ollama             | OpenAI                   |
|----------------------------|--------------------|--------------------------|
| **AI_PROVIDER**            | `ollama`           | `openai`                 |
| **Modelo Embedding**       | `nomic-embed-text` | `text-embedding-3-small` |
| **Dimensiones**            | **768**            | **1536**                 |
| **numDimensions en Atlas** | **768**            | **1536**                 |
| **Index Name**             | `default`          | `default`                |
| **Collection**             | `document_chunks`  | `document_chunks`        |
| **Similarity**             | `cosine`           | `cosine`                 |

---

## 🎯 Mejores Prácticas

### 1. Documenta tu provider activo

Crea un archivo `CURRENT_AI_PROVIDER.txt` en el root del proyecto:

```bash
# Windows
echo ollama > CURRENT_AI_PROVIDER.txt

# O para OpenAI
echo openai > CURRENT_AI_PROVIDER.txt
```

### 2. Script de verificación en CI/CD

Agrega a tus tests:

```typescript
// Verificar que dimensiones coinciden
const expectedDim = embeddingService.getDimensions();
const chunks = await getChunks();
if (chunks[0].embedding.length !== expectedDim) {
  throw new Error('Embedding dimensions mismatch! Re-index required.');
}
```

### 3. Alertas de monitoreo

En producción, monitorea:

- Vector search returning 0 results cuando debería haber datos
- Errores de dimensiones en logs

### 4. Backup antes de cambiar

Antes de eliminar índices o cambiar providers:

```bash
# Backup de chunks (Unix-like)
mongoexport --uri="$MONGO_ATLAS_URI" \
  --collection=document_chunks \
  --out=chunks_backup_$(date +%Y%m%d).json
```

---

## 📖 Referencias

- [MongoDB Atlas Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/create-index/)
- [Ollama Embeddings](https://ollama.com/library/nomic-embed-text)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

---

## 🔗 Scripts Relacionados

- **Diagnóstico:** `npx ts-node scripts/diagnose-rag.ts`
- **Verificar chunks:** `npx ts-node scripts/verify-multitenancy.ts`
- **Reindexar:** `npx ts-node scripts/reindex-documents.ts`

---

**Última actualización:** Febrero 2026  
**Mantenedor:** Equipo CloudDocs Backend
