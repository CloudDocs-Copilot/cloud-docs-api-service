# Guía de Configuración del Módulo de IA - CloudDocs API

## Índice

1. [Resumen de Proveedores](#resumen-de-proveedores)
2. [Opción 1: Mock (Testing)](#opción-1-mock-testing)
3. [Opción 2: Ollama (Local/Gratis)](#opción-2-ollama-localgratis)
4. [Opción 3: OpenAI (Producción)](#opción-3-openai-producción)
5. [MongoDB Atlas para Vector Search](#mongodb-atlas-para-vector-search)
6. [Verificar la Configuración](#verificar-la-configuración)
7. [Configuración de Producción](#configuración-de-producción)
8. [Solución de Problemas](#solución-de-problemas)

---

## Resumen de Proveedores

CloudDocs utiliza un patrón de **abstracción de proveedores** que permite cambiar entre backends de IA con una sola variable de entorno:

| Proveedor | Coste | Requisitos | Modelos | Uso recomendado |
|-----------|-------|------------|---------|-----------------|
| **`mock`** | Gratis | Ninguno | — | Tests, CI/CD, demos |
| **`ollama`** | Gratis | Ollama instalado (~3GB modelos) | `llama3.2:3b` + `nomic-embed-text` | Desarrollo local |
| **`openai`** | Pago | API key + MongoDB Atlas | `gpt-4o-mini` + `text-embedding-3-small` | Producción |

La selección se realiza mediante la variable `AI_PROVIDER` en `.env.local`:

```bash
# Elegir proveedor: 'mock' | 'ollama' | 'openai'
AI_PROVIDER=ollama
```

---

## Opción 1: Mock (Testing)

El proveedor Mock devuelve respuestas determinísticas. Ideal para tests automatizados y CI/CD.

### Configuración

```bash
# En .env.local
AI_PROVIDER=mock
```

No requiere ninguna otra configuración. Las respuestas son instantáneas y predecibles.

### Limitaciones

- Las respuestas no son inteligentes (siempre devuelve el mismo texto)
- Los embeddings son vectores fijos (no semánticos)
- Útil solo para verificar flujos, no para calidad de IA

---

## Opción 2: Ollama (Local/Gratis)

[Ollama](https://ollama.com) permite ejecutar modelos de lenguaje localmente sin coste ni API key.

### Paso 1: Instalar Ollama

**macOS:**

```bash
brew install ollama
```

**Windows:**

```bash
winget install Ollama.Ollama
```

**Linux:**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verificar instalación:

```bash
ollama --version
```

### Paso 2: Descargar Modelos

Se necesitan 2 modelos (~3GB en total):

```bash
# Modelo de chat (generación de texto) - ~2GB
ollama pull llama3.2:3b

# Modelo de embeddings (vectorización) - ~274MB
ollama pull nomic-embed-text
```

Verificar modelos:

```bash
ollama list
# Debería mostrar: llama3.2:3b y nomic-embed-text
```

### Paso 3: Iniciar Ollama

Ollama se ejecuta como un servicio local en `http://localhost:11434`:

```bash
# macOS/Linux: se inicia automáticamente o ejecutar
ollama serve

# Verificar que está corriendo
curl http://localhost:11434/api/tags
```

### Paso 4: Configurar Variables de Entorno

```bash
# En .env.local
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Paso 5: Almacenamiento de Chunks (Ollama)

Con Ollama, los chunks y embeddings se almacenan en tu **MongoDB local** (la misma del `MONGO_URI`), en la colección `documentChunks`. No necesitas MongoDB Atlas.

> **Nota:** Si ya tienes `MONGO_ATLAS_URI` configurado, se usará Atlas. Si no, se usa MongoDB local automáticamente.

### Modelos Alternativos

| Modelo Chat | Parámetros | VRAM | Notas |
|-------------|-----------|------|-------|
| `llama3.2:1b` | 1B | ~1GB | Más rápido, menos preciso |
| `llama3.2:3b` | 3B | ~2GB | **Recomendado** |
| `llama3.1:8b` | 8B | ~5GB | Más preciso, más lento |

| Modelo Embedding | Dimensiones | VRAM | Notas |
|-----------------|-------------|------|-------|
| `nomic-embed-text` | 768 | ~274MB | **Recomendado** |
| `mxbai-embed-large` | 1024 | ~670MB | Mayor calidad |

---

## Opción 3: OpenAI (Producción)

La opción más potente, usa APIs de OpenAI para chat y embeddings.

### Paso 1: Obtener API Key

1. Ir a [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Crear una nueva API key
3. Asegurar que la cuenta tiene créditos/plan de pago

### Paso 2: Configurar Variables de Entorno

```bash
# En .env.local
AI_PROVIDER=openai
OPENAI_API_KEY=sk-tu-api-key-aqui
```

### Paso 3: Configurar MongoDB Atlas (Requerido)

OpenAI genera embeddings de **1536 dimensiones** que necesitan un índice vectorial en MongoDB Atlas. Ver la sección [MongoDB Atlas para Vector Search](#mongodb-atlas-para-vector-search).

### Modelos Utilizados

| Función | Modelo | Dimensiones | Coste aprox. |
|---------|--------|-------------|--------------|
| Chat/Generación | `gpt-4o-mini` | — | ~$0.15/1M tokens input |
| Embeddings | `text-embedding-3-small` | 1536 | ~$0.02/1M tokens |

---

## MongoDB Atlas para Vector Search

MongoDB Atlas es **necesario para OpenAI** (1536 dims requieren índice vectorial) y **opcional para Ollama** (768 dims pueden funcionar en local sin índice vectorial, con menor rendimiento).

### Paso 1: Crear Cluster en Atlas

1. Ir a [cloud.mongodb.com](https://cloud.mongodb.com)
2. Crear cuenta gratuita (M0 tier es suficiente para desarrollo)
3. Crear un cluster (región recomendada: la más cercana)
4. En **Network Access**: añadir tu IP o `0.0.0.0/0` para desarrollo
5. En **Database Access**: crear usuario con permisos de lectura/escritura

### Paso 2: Obtener Connection String

1. Ir a **Clusters** > **Connect** > **Drivers**
2. Copiar el connection string:

```
mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/cloud_docs_ia
```

### Paso 3: Crear Índice Vectorial

En MongoDB Atlas, ir a tu cluster > **Atlas Search** > **Create Search Index** > **JSON Editor**:

**Base de datos:** `cloud_docs_ia`  
**Colección:** `documentChunks`  
**Nombre del índice:** `vector_index`

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

> **Nota para Ollama:** Si usas Ollama con Atlas, cambia `numDimensions` a `768`.

### Paso 4: Configurar Variable de Entorno

```bash
# En .env.local
MONGO_ATLAS_URI=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/cloud_docs_ia
```

---

## Verificar la Configuración

### 1. Comprobar que el servidor arranca

```bash
npm run dev
```

Deberías ver en los logs:

```
AI Provider: ollama (o openai/mock)
Connected to MongoDB Atlas ✓  (si MONGO_ATLAS_URI está configurado)
```

### 2. Probar extracción de texto

```bash
# Primero, hacer login para obtener token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clouddocs.local","password":"Test@1234"}' \
  | jq -r '.token')

# Extraer texto de un documento (reemplazar :id con un ID real)
curl -X GET http://localhost:4000/api/ai/documents/:id/extract-text \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Probar procesamiento completo

```bash
# Procesar documento (chunking + embeddings)
curl -X POST http://localhost:4000/api/ai/documents/:id/process \
  -H "Authorization: Bearer $TOKEN"

# Hacer una pregunta sobre el documento
curl -X POST http://localhost:4000/api/ai/documents/:id/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "¿De qué trata este documento?"}'
```

### 4. Probar RAG organizacional

```bash
# Preguntar sobre todos los documentos de la organización
curl -X POST http://localhost:4000/api/ai/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "¿Qué documentos tengo sobre contratos?"}'
```

### 5. Ejecutar tests de IA

```bash
# Tests unitarios de IA (usa mock provider, no necesita setup externo)
npm run test:unit -- --testPathPattern=ai

# Tests de integración de IA
npm test -- --testPathPattern=ai
```

---

## Configuración de Producción

### Variables de Entorno Requeridas

```bash
# Producción (ejemplo)
NODE_ENV=production
AI_PROVIDER=openai
OPENAI_API_KEY=sk-prod-key-here
MONGO_ATLAS_URI=mongodb+srv://prod-user:prod-pass@prod-cluster.mongodb.net/cloud_docs_ia
```

### Docker Compose

El `docker-compose.yml` del workspace raíz incluye la configuración del backend. Para habilitar IA en Docker:

```yaml
# En docker-compose.yml, añadir variables al servicio api:
services:
  api:
    environment:
      - AI_PROVIDER=openai
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MONGO_ATLAS_URI=${MONGO_ATLAS_URI}
```

### Checklist de Producción

- [ ] `AI_PROVIDER=openai` configurado
- [ ] `OPENAI_API_KEY` con key de producción
- [ ] `MONGO_ATLAS_URI` apuntando a cluster de producción
- [ ] Índice vectorial creado en Atlas (`vector_index` en `documentChunks`)
- [ ] Network Access de Atlas configurado para las IPs del servidor
- [ ] Rate limiting configurado para endpoints `/api/ai/*`
- [ ] Monitorización de costes de OpenAI activada

### Estimación de Costes (OpenAI)

| Operación | Coste Aproximado |
|-----------|-----------------|
| Procesar 1 documento (10 páginas) | ~$0.001 (embeddings) |
| 1 pregunta RAG | ~$0.002 (embedding + chat) |
| Clasificar 1 documento | ~$0.001 |
| Resumir 1 documento | ~$0.002 |
| **100 documentos + 1000 preguntas/mes** | **~$2.50/mes** |

---

## Solución de Problemas

### Ollama no responde

```bash
# Verificar que está corriendo
curl http://localhost:11434/api/tags

# Si no responde, iniciar el servicio
ollama serve

# Verificar modelos instalados
ollama list
```

### Error "Model not found"

```bash
# Descargar modelos faltantes
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

### Error de conexión a MongoDB Atlas

```bash
# Verificar connection string
# Verificar que tu IP está en Network Access de Atlas
# Probar conexión directamente
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/cloud_docs_ia"
```

### Embeddings no se generan

1. Verificar `AI_PROVIDER` en `.env.local`
2. Si es `openai`: verificar que `OPENAI_API_KEY` es válida
3. Si es `ollama`: verificar que Ollama está corriendo y modelos descargados
4. Revisar logs del servidor para errores específicos

### Vector Search no devuelve resultados

1. Verificar que el documento fue procesado (`POST /api/ai/documents/:id/process`)
2. Verificar que el índice `vector_index` existe en Atlas
3. Verificar que `numDimensions` del índice coincide con el proveedor (1536 para OpenAI, 768 para Ollama)
4. Verificar que `organizationId` del usuario coincide con los chunks

---

## Referencias

- [Documentación completa del módulo de IA](AI-MODULE.md)
- [Ollama - Documentación oficial](https://ollama.com)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [MongoDB Atlas Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [RFE-AI-001: Provider Abstraction](RFE/RFE-AI-001-PROVIDER-ABSTRACTION.md)
