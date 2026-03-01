# 📋 Plan de Pruebas de Usuario - IA, Elasticsearch y OCR

**Proyecto:** CloudDocs API Service  
**Fecha:** Febrero 2026  
**Versión:** 1.0  
**Total de Pruebas:** 56

---

## 📑 Índice

1. [Configuración Inicial](#-configuración-inicial)
2. [Módulo RAG (Retrieval-Augmented Generation)](#-módulo-rag-retrieval-augmented-generation)
3. [Módulo de Clasificación Automática](#️-módulo-clasificación)
4. [Módulo de Resumen (Summarization)](#-módulo-resumen-summarization)
5. [Módulo OCR (Reconocimiento de Texto)](#️-módulo-ocr-reconocimiento-de-texto)
6. [Módulo Elasticsearch (Búsqueda)](#-módulo-elasticsearch)
7. [Extracción de Texto](#-módulo-extracción-texto)
8. [Multitenancy y Seguridad](#-módulo-multitenancy-y-seguridad)
9. [Procesamiento de Documentos](#-módulo-procesamiento-de-documentos)
10. [Integración End-to-End](#-módulo-integración-end-to-end)

---

## 🔧 Configuración Inicial

### Variables de Entorno Requeridas

Crear archivo `.env` con:

```bash
# Base de datos
MONGO_URI=mongodb://localhost:27017/clouddocs
MONGO_ATLAS_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/clouddocs

# Elasticsearch (opcional)
ES_ENABLED=true
ES_NODE=http://localhost:9200

# OpenAI API
OPENAI_API_KEY=sk-proj-...
AI_PROVIDER=openai  # openai, ollama, o mock

# OCR
OCR_ENABLED=true
OCR_LANGUAGES=spa+eng

# JWT
JWT_SECRET=tu-secret-key
JWT_EXPIRES_IN=7d

# Puerto
PORT=4000
```

### Herramientas Necesarias

- **Postman** o **Thunder Client** (VS Code)
- **MongoDB Compass** (para ver datos)
- **Elasticsearch HQ** o Kibana (para verificar índices)
- Documentos de prueba en diferentes formatos (PDF, DOCX, PNG, JPG)

### Usuarios de Prueba

Crear 3 usuarios en 2 organizaciones diferentes:

```bash
# Ejecutar seed:
npm run seed:dev

# Usuarios creados:
# Usuario 1: admin@clouddocs.local / Test@1234 (Org: CloudDocs)
# Usuario 2: john@clouddocs.local / Test@1234 (Org: CloudDocs)
# Usuario 3: jane@clouddocs.local / Test@1234 (Org: TechCorp)
```

---

## 📚 Módulo RAG (Retrieval-Augmented Generation)

### 🧪 Grupo 1: Extracción y Procesamiento Básico

#### Prueba 1.1: Extraer texto de PDF con texto

**Objetivo:** Verificar extracción de texto de PDFs normales

**Pasos:**

1. Login como `admin@clouddocs.local`
2. Subir un PDF con texto (ejemplo: `invoice.pdf`)
3. Obtener el `documentId` de la respuesta
4. Llamar a `GET /api/ai/documents/{documentId}/extract-text`

**Resultado Esperado:**

```json
{
  "success": true,
  "message": "Text extracted successfully",
  "data": {
    "text": "FACTURA...",
    "charCount": 850,
    "wordCount": 142,
    "mimeType": "application/pdf",
    "metadata": {
      "pages": 2
    }
  }
}
```

**Verificar:**

- ✅ Status 200
- ✅ El texto extraído es legible
- ✅ `charCount` > 0
- ✅ `wordCount` > 0

---

#### Prueba 1.2: Extraer texto de DOCX

**Objetivo:** Verificar extracción de Word moderno

**Pasos:**

1. Login como `admin@clouddocs.local`
2. Subir un archivo DOCX (ejemplo: `report.docx`)
3. Llamar a `GET /api/ai/documents/{documentId}/extract-text`

**Resultado Esperado:**

- Status 200
- Texto extraído con formato correcto
- Metadata del documento

**Verificar:**

- ✅ Párrafos preservados
- ✅ No hay caracteres extraños
- ✅ `mimeType` = `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

---

#### Prueba 1.3: Extraer texto de archivo TXT

**Objetivo:** Verificar extracción de texto plano

**Pasos:**

1. Subir un archivo `.txt` con contenido UTF-8
2. Llamar a `GET /api/ai/documents/{documentId}/extract-text`

**Resultado Esperado:**

- Status 200
- Texto idéntico al archivo original
- Sin metadata adicional

---

#### Prueba 1.4: Procesar documento con chunking

**Objetivo:** Verificar división en chunks y generación de embeddings

**Pasos:**

1. Subir un PDF largo (>3000 palabras)
2. Extraer texto: `GET /api/ai/documents/{documentId}/extract-text`
3. Copiar el texto de la respuesta
4. Procesar: `POST /api/ai/documents/{documentId}/process`

   ```json
   {
     "text": "texto extraído aquí..."
   }
   ```

**Resultado Esperado:**

```json
{
  "success": true,
  "message": "Document processed successfully",
  "data": {
    "documentId": "...",
    "chunksCreated": 8,
    "dimensions": 1536,
    "processingTimeMs": 2547.3
  }
}
```

**Verificar:**

- ✅ `chunksCreated` >= 1
- ✅ `dimensions` = 1536 (para OpenAI) o 768 (para Ollama)
- ✅ Tiempo de procesamiento razonable (<30 segundos para documentos normales)
- ✅ En MongoDB Atlas, verificar colección `document_chunks` contiene los chunks

---

#### Prueba 1.5: Verificar chunks en MongoDB Atlas

**Objetivo:** Confirmar que los chunks se almacenan correctamente

**Pasos:**

1. Abrir MongoDB Compass
2. Conectar a MongoDB Atlas
3. Navegar a la base de datos `clouddocs` → colección `document_chunks`
4. Buscar chunks del documento procesado

**Verificar:**

- ✅ Los chunks existen con el `documentId` correcto
- ✅ Cada chunk tiene campo `embedding` (array de 1536 números)
- ✅ Cada chunk tiene campo `organizationId`
- ✅ Cada chunk tiene campo `content` con texto legible
- ✅ Cada chunk tiene `chunkIndex` secuencial (0, 1, 2, ...)

---

### 🧪 Grupo 2: Búsqueda RAG General

#### Prueba 2.1: Preguntar sobre todos los documentos de una organización

**Objetivo:** RAG general en todos los documentos

**Pasos:**

1. Procesar al menos 3 documentos en la organización "CloudDocs"
2. Login como `admin@clouddocs.local`
3. Llamar a `POST /api/ai/ask`

   ```json
   {
     "question": "¿Cuáles son los principales objetivos del proyecto?",
     "organizationId": "{organizationId}"
   }
   ```

**Resultado Esperado:**

```json
{
  "success": true,
  "data": {
    "answer": "Según los documentos, los principales objetivos son...",
    "sources": ["doc1Id", "doc2Id"],
    "chunks": [
      {
        "documentId": "doc1Id",
        "content": "texto relevante...",
        "score": 0.892
      }
    ]
  }
}
```

**Verificar:**

- ✅ La respuesta tiene sentido contextualmente
- ✅ `sources` contiene IDs de documentos procesados
- ✅ `chunks` tiene al menos 1 resultado
- ✅ Los `chunks` tienen `score` > 0.7 (alta relevancia)

---

#### Prueba 2.2: Pregunta sin resultados relevantes

**Objetivo:** Ver cómo RAG maneja preguntas sin contexto

**Pasos:**

1. Subir documento sobre "finanzas"
2. Preguntar: "¿Cómo se prepara una pizza?"

**Resultado Esperado:**

- Respuesta indicando que no hay información relevante
- `sources` = []
- `chunks` = []

---

#### Prueba 2.3: Pregunta con caracteres especiales

**Objetivo:** Verificar manejo de caracteres UTF-8

**Pasos:**

1. Preguntar: "¿Cuál es el coste total de € 1,500.00?"

**Verificar:**

- ✅ No hay errores de encoding
- ✅ Respuesta correcta si el documento contiene esa información

---

#### Prueba 2.4: Pregunta muy larga (>500 palabras)

**Objetivo:** Validar límites de entrada

**Pasos:**

1. Enviar pregunta de 600 palabras

**Resultado Esperado:**

- Error 400: "Question too long" o truncamiento automático

---

#### Prueba 2.5: Pregunta vacía o solo espacios

**Objetivo:** Validación de entrada

**Pasos:**

1. Enviar: `{ "question": "   ", "organizationId": "..." }`

**Resultado Esperado:**

- Error 400: "Question is required and must be a non-empty string"

---

### 🧪 Grupo 3: Búsqueda RAG en Documento Específico

#### Prueba 3.1: Preguntar sobre un documento específico

**Objetivo:** RAG con scope limitado a un documento

**Pasos:**

1. Procesar documento `contrato.pdf`
2. Llamar a `POST /api/ai/documents/{documentId}/ask`

   ```json
   {
     "question": "¿Cuál es la fecha de vencimiento del contrato?"
   }
   ```

**Resultado Esperado:**

- Respuesta basada SOLO en ese documento
- `sources` = [documentId]

**Verificar:**

- ✅ La respuesta no contiene información de otros documentos
- ✅ Solo 1 documento en `sources`

---

#### Prueba 3.2: Preguntar sobre documento sin procesar

**Objetivo:** Validar que el documento debe estar procesado

**Pasos:**

1. Subir documento pero NO llamar a `/process`
2. Intentar preguntar: `POST /api/ai/documents/{documentId}/ask`

**Resultado Esperado:**

- Error 400: "Document has not been processed. No chunks found."

---

#### Prueba 3.3: Preguntar sobre documento de otra organización

**Objetivo:** Verificar seguridad multitenancy

**Pasos:**

1. Login como `admin@clouddocs.local` (Org: CloudDocs)
2. Obtener ID de documento de Jane (Org: TechCorp)
3. Intentar: `POST /api/ai/documents/{documentIdDeTechCorp}/ask`

**Resultado Esperado:**

- Error 403: "Access denied" o 404: "Document not found"

---

#### Prueba 3.4: Usuario sin membresía activa

**Objetivo:** Validar que usuarios bloqueados no pueden usar RAG

**Pasos:**

1. Crear usuario y organizacion
2. Eliminar la membresía del usuario
3. Intentar hacer pregunta RAG

**Resultado Esperado:**

- Error 403: "You are not a member of this organization"

---

#### Prueba 3.5: Documento compartido con usuario

**Objetivo:** Verificar que usuarios con acceso compartido pueden preguntar

**Pasos:**

1. Admin sube documento
2. Admin comparte con John: `PUT /api/documents/{documentId}/share`
3. Login como John
4. John pregunta: `POST /api/ai/documents/{documentId}/ask`

**Resultado Esperado:**

- Status 200, respuesta correcta

---

## 🏷️ Módulo Clasificación

### 🧪 Grupo 4: Clasificación Manual

#### Prueba 4.1: Clasificar una factura

**Objetivo:** Verificar clasificación correcta de documento financiero

**Pasos:**

1. Subir `invoice.pdf` que contenga: "FACTURA #12345, Total: €1,500.00"
2. Extraer texto
3. Llamar a `POST /api/ai/documents/{documentId}/classify`

**Resultado Esperado:**

```json
{
  "success": true,
  "message": "Document classified successfully",
  "data": {
    "category": "Factura",
    "confidence": 0.95,
    "tags": ["finanzas", "factura", "pago", "IVA"]
  }
}
```

**Verificar:**

- ✅ `category` = "Factura"
- ✅ `confidence` >= 0.7
- ✅ `tags` contiene etiquetas relevantes (3-7 tags)

---

#### Prueba 4.2: Clasificar un contrato

**Objetivo:** Clasificación de documentos legales

**Pasos:**

1. Subir contrato con texto: "CONTRATO DE PRESTACIÓN DE SERVICIOS, Cláusula primera..."
2. Extraer y clasificar

**Resultado Esperado:**

- `category` = "Contrato"
- `tags` incluye: "contrato", "legal", "cláusulas"

---

#### Prueba 4.3: Clasificar un informe técnico

**Objetivo:** Clasificación de documentación técnica

**Pasos:**

1. Subir documento con "INFORME TÉCNICO, Análisis de rendimiento, Conclusiones..."
2. Clasificar

**Resultado Esperado:**

- `category` = "Informe"
- `confidence` >= 0.7

---

#### Prueba 4.4: Clasificar documento ambiguo

**Objetivo:** Ver cómo maneja documentos difíciles de clasificar

**Pasos:**

1. Subir documento muy corto o con texto aleatorio
2. Clasificar

**Resultado Esperado:**

- `category` = "Otro"
- `confidence` < 0.5

---

#### Prueba 4.5: Clasificar sin texto extraído

**Objetivo:** Validación de pre-requisitos

**Pasos:**

1. Subir documento pero NO extraer texto
2. Intentar clasificar

**Resultado Esperado:**

- Error 400: "Document has no extracted text. Process the document first"

---

#### Prueba 4.6: Re-clasificar documento

**Objetivo:** Verificar que se puede actualizar clasificación

**Pasos:**

1. Clasificar documento → obtener categoria A
2. Volver a clasificar el mismo documento
3. Verificar que la categoria puede cambiar (si cambia el proveedor o prompt)

**Verificar:**

- ✅ No hay errores
- ✅ La nueva clasificación sobrescribe la anterior en MongoDB

---

#### Prueba 4.7: Verificar categorías válidas

**Objetivo:** Asegurar que solo se asignan categorías predefinidas

**Pasos:**

1. Clasificar varios documentos diferentes
2. Para cada uno, verificar que `category` está en la lista:
   - Factura
   - Contrato
   - Informe
   - Presentación
   - Correspondencia
   - Manual técnico
   - Imagen/Fotografía
   - Hoja de cálculo
   - Documento personal
   - Otro

**Verificar:**

- ✅ NUNCA se asigna una categoría fuera de esta lista

---

## 📝 Módulo Resumen (Summarization)

### 🧪 Grupo 5: Generación de Resúmenes

#### Prueba 5.1: Generar resumen de documento largo

**Objetivo:** Verificar resumenes concisos

**Pasos:**

1. Subir documento de 5+ páginas
2. Extraer texto
3. Llamar a `POST /api/ai/documents/{documentId}/summarize`

**Resultado Esperado:**

```json
{
  "success": true,
  "message": "Document summarized successfully",
  "data": {
    "summary": "Este documento trata sobre...",
    "keyPoints": [
      "Punto clave 1",
      "Punto clave 2",
      "Punto clave 3"
    ]
  }
}
```

**Verificar:**

- ✅ `summary` tiene 2-3 frases (no más de 200 caracteres)
- ✅ `keyPoints` tiene 3-5 puntos
- ✅ El resumen es coherente y representa el contenido

---

#### Prueba 5.2: Resumen de documento corto

**Objetivo:** Ver cómo maneja textos breves

**Pasos:**

1. Subir documento de 1 página (200 palabras)
2. Generar resumen

**Resultado Esperado:**

- Resumen proporcional al contenido
- No debe ser más largo que el documento original

---

#### Prueba 5.3: Resumen sin texto extraído

**Objetivo:** Validación de pre-requisitos

**Pasos:**

1. Subir documento sin extraer texto
2. Intentar resumir

**Resultado Esperado:**

- Error 400: "Document has no extracted text"

---

#### Prueba 5.4: Verificar que el resumen se guarda en MongoDB

**Objetivo:** Persistencia de datos

**Pasos:**

1. Generar resumen
2. Verificar en MongoDB que el documento tiene campos:
   - `aiSummary`: "texto del resumen"
   - `aiKeyPoints`: ["punto 1", "punto 2", ...]

**Verificar con MongoDB Compass:**

```javascript
db.documents.findOne({ _id: ObjectId("...") })
// Debe tener aiSummary y aiKeyPoints rellenados
```

---

#### Prueba 5.5: Re-generar resumen

**Objetivo:** Actualización de resumen existente

**Pasos:**

1. Generar resumen de documento
2. Volver a llamar `POST /api/ai/documents/{documentId}/summarize`
3. Verificar que el resumen se actualiza

**Verificar:**

- ✅ No hay error de duplicación
- ✅ El nuevo resumen sobrescribe el anterior

---

## 🖼️ Módulo OCR (Reconocimiento de Texto)

### 🧪 Grupo 6: Extracción con OCR

#### Prueba 6.1: Extraer texto de imagen PNG con texto

**Objetivo:** OCR básico en imágenes

**Pre-requisitos:**

- `OCR_ENABLED=true` en `.env`

**Pasos:**

1. Crear imagen PNG con texto (usar herramienta de texto sobre fondo)
2. Subir la imagen
3. Llamar a `GET /api/ai/documents/{documentId}/extract-text`

**Resultado Esperado:**

- Status 200
- `text` contiene el texto de la imagen
- `mimeType` = "image/png"

**Verificar:**

- ✅ El texto es legible (puede tener pequeños errores OCR)
- ✅ Tiempo de procesamiento < 10 segundos

---

#### Prueba 6.2: Extraer texto de JPG escaneado

**Objetivo:** OCR en imagen JPEG

**Pasos:**

1. Subir foto de documento (factura escaneada en JPG)
2. Extraer texto

**Resultado Esperado:**

- Texto extraído con precisión razonable (>80%)
- Números y fechas reconocibles

---

#### Prueba 6.3: Extraer texto de PDF escaneado (sin texto)

**Objetivo:** OCR fallback para PDFs imagen

**Pasos:**

1. Crear PDF escaneado (imagen dentro de PDF, sin texto)
2. Subir documento
3. Extraer texto

**Resultado Esperado:**

- El sistema detecta que `pdf-parse` retorna texto vacío
- Fallback a OCR automáticamente
- Texto extraído de la imagen

**Verificar en logs:**

```example
[text-extraction] PDF returned empty text, attempting OCR fallback
```

---

#### Prueba 6.4: OCR con idioma español

**Objetivo:** Verificar configuración de idioma

**Pasos:**

1. Asegurar `OCR_LANGUAGES=spa+eng` en `.env`
2. Subir imagen con texto en español (tildes, ñ)
3. Extraer texto

**Verificar:**

- ✅ Caracteres especiales (á, é, ñ) se reconocen correctamente

---

#### Prueba 6.5: OCR deshabilitado

**Objetivo:** Validar comportamiento cuando OCR está off

**Pasos:**

1. Configurar `OCR_ENABLED=false` en `.env`
2. Reiniciar servidor
3. Intentar subir imagen PNG
4. Llamar a `GET /api/ai/documents/{documentId}/extract-text`

**Resultado Esperado:**

- Error 400: "OCR is disabled on server"

---

#### Prueba 6.6: OCR en imagen con baja calidad

**Objetivo:** Manejo de imágenes difíciles

**Pasos:**

1. Subir imagen borrosa o con bajo contraste
2. Extraer texto

**Resultado Esperado:**

- No debe fallar (error 500)
- Puede retornar texto vacío o con errores
- `charCount` puede ser bajo

---

#### Prueba 6.7: OCR en imagen sin texto

**Objetivo:** Imagen que solo contiene gráficos

**Pasos:**

1. Subir imagen sin texto (logo, foto sin letras)
2. Extraer texto

**Resultado Esperado:**

- Status 200
- `text` vacío o con caracteres aleatorios mínimos
- `charCount` cercano a 0

---

## 🔍 Módulo Elasticsearch

### 🧪 Grupo 7: Búsqueda Full-Text

#### Prueba 7.1: Buscar por nombre de archivo

**Objetivo:** Búsqueda básica en metadatos

**Pre-requisitos:**

- `ES_ENABLED=true` en `.env`
- Elasticsearch corriendo en `http://localhost:9200`

**Pasos:**

1. Subir documento llamado `presupuesto-2026.pdf`
2. Esperar 2 segundos (indexación asíncrona)
3. Buscar: `GET /api/search?q=presupuesto`

**Resultado Esperado:**

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "filename": "presupuesto-2026.pdf",
      "_score": 4.5
    }
  ],
  "total": 1
}
```

**Verificar:**

- ✅ El documento aparece en resultados
- ✅ `_score` > 1.0

---

#### Prueba 7.2: Buscar por contenido del documento

**Objetivo:** Verificar que el contenido extraído se indexa

**Pasos:**

1. Subir PDF con texto "El objetivo del Q1 2026 es aumentar ventas"
2. Extraer texto
3. Procesar documento (esto también indexa en ES)
4. Buscar: `GET /api/search?q=objetivo Q1 2026`

**Resultado Esperado:**

- El documento aparece en resultados
- Score alto por coincidencia exacta

**Verificar:**

- ✅ La búsqueda encuentra documentos por su contenido interno
- ✅ No solo por nombre de archivo

---

#### Prueba 7.3: Búsqueda con fuzziness (tolerancia a errores)

**Objetivo:** Corrección automática de typos

**Pasos:**

1. Subir documento con "tecnología"
2. Buscar con typo: `GET /api/search?q=tecnologia` (sin tilde)

**Resultado Esperado:**

- El documento se encuentra igual (fuzzy matching)

---

#### Prueba 7.4: Búsqueda por categoría AI

**Objetivo:** Filtros facetados

**Pasos:**

1. Clasificar varios documentos (al menos 3 facturas, 2 contratos)
2. Buscar: `GET /api/search?q=*&category=Factura`

**Resultado Esperado:**

- Solo documentos con `aiCategory: "Factura"` aparecen
- Contratos NO aparecen en resultados

---

#### Prueba 7.5: Búsqueda por tags AI

**Objetivo:** Filtrado por etiquetas

**Pasos:**

1. Clasificar documento con tags: `["finanzas", "2026", "IVA"]`
2. Buscar: `GET /api/search?q=finanzas`

**Resultado Esperado:**

- El documento aparece con score alto (boost en tags)

---

#### Prueba 7.6: Búsqueda por organización (multitenancy)

**Objetivo:** Aislamiento de datos

**Pasos:**

1. Login como Admin (Org: CloudDocs)
2. Buscar: `GET /api/search?q=contrato`

**Resultado Esperado:**

- Solo documentos de CloudDocs aparecen
- Documentos de TechCorp NO aparecen

**Repetir:**
3. Login como Jane (Org: TechCorp)
4. Buscar: `GET /api/search?q=contrato`
5. Verificar que solo aparecen documentos de TechCorp

---

#### Prueba 7.7: Búsqueda con paginación

**Objetivo:** Manejo de resultados largos

**Pasos:**

1. Subir 25 documentos
2. Buscar: `GET /api/search?q=documento&limit=10&offset=0`
3. Buscar página 2: `GET /api/search?q=documento&limit=10&offset=10`

**Verificar:**

- ✅ Primera llamada retorna 10 documentos
- ✅ Segunda llamada retorna otros 10 diferentes
- ✅ `total` = 25 en ambas respuestas

---

#### Prueba 7.8: Autocompletado de búsqueda

**Objetivo:** Sugerencias mientras escribe

**Pasos:**

1. Subir documentos: "presupuesto.pdf", "presentacion.pdf"
2. Buscar: `GET /api/search/autocomplete?q=pre&limit=5`

**Resultado Esperado:**

```json
{
  "success": true,
  "suggestions": [
    "presupuesto",
    "presentacion"
  ]
}
```

---

#### Prueba 7.9: Verificar índice en Elasticsearch

**Objetivo:** Confirmar estructura del índice

**Pasos:**

1. Abrir navegador: `http://localhost:9200/documents/_mapping`
2. Verificar que el mapping incluye:
   - `filename` (type: text)
   - `content` (type: text)
   - `aiCategory` (type: keyword)
   - `aiTags` (type: keyword)
   - `organization` (type: keyword)

**Verificar estructura:**

```json
{
  "documents": {
    "mappings": {
      "properties": {
        "content": { "type": "text", "analyzer": "spanish_analyzer" },
        "aiCategory": { "type": "keyword" },
        ...
      }
    }
  }
}
```

---

## 📄 Módulo Extracción Texto

### 🧪 Grupo 8: Formatos Soportados

#### Prueba 8.1: Extraer metadata de PDF

**Objetivo:** Verificar extracción de metadata

**Pasos:**

1. Subir PDF con metadata (autor, título, fecha)
2. Extraer texto

**Resultado Esperado:**

```json
{
  "metadata": {
    "pages": 5,
    "author": "John Doe",
    "title": "Informe Anual",
    "creationDate": "2026-01-15T10:30:00.000Z"
  }
}
```

---

#### Prueba 8.2: Extraer de DOC (Word antiguo)

**Objetivo:** Compatibilidad con Word 97-2003

**Pasos:**

1. Subir archivo `.doc` (formato antiguo)
2. Extraer texto

**Resultado Esperado:**

- Texto extraído (puede tener limitaciones)
- No debe fallar con error 500

---

#### Prueba 8.3: Extraer de Markdown

**Objetivo:** Archivos .md

**Pasos:**

1. Subir archivo `README.md`
2. Extraer texto

**Resultado Esperado:**

- Texto con sintaxis Markdown preservada
- Headers, links, etc. visibles en texto plano

---

#### Prueba 8.4: Archivo no soportado

**Objetivo:** Manejo de formatos desconocidos

**Pasos:**

1. Intentar subir archivo `.xls` (Excel)
2. Llamar a extract-text

**Resultado Esperado:**

- Error 400: "Unsupported file type"

---

#### Prueba 8.5: Archivo corrupto

**Objetivo:** Manejo de errores

**Pasos:**

1. Crear archivo `.pdf` corrupto (truncar bytes)
2. Subir e intentar extraer

**Resultado Esperado:**

- Error 500 con mensaje descriptivo
- No debe crash

ear el servidor

---

## 🔒 Módulo Multitenancy y Seguridad

### 🧪 Grupo 9: Aislamiento de Datos

#### Prueba 9.1: Usuario NO puede ver documentos de otra organización via RAG

**Objetivo:** Seguridad crítica

**Pasos:**

1. Admin (CloudDocs) sube y procesa `documento-secreto.pdf`
2. Jane (TechCorp) intenta preguntar:

   ```json
   POST /api/ai/ask
   {
     "question": "¿Qué dice el documento secreto?",
     "organizationId": "{cloudDocsOrgId}"
   }
   ```

**Resultado Esperado:**

- Error 403: "Access denied: You are not a member of this organization"

---

#### Prueba 9.2: Chunks solo retornan de la organización correcta

**Objetivo:** Filtro de vector search

**Pasos:**

1. Procesar documentos en CloudDocs
2. Procesar documentos en TechCorp
3. Hacer búsqueda RAG como Admin (CloudDocs)
4. Verificar que TODOS los chunks retornados tienen `organizationId` = CloudDocs

**Verificar en respuesta:**

```json
{
  "chunks": [
    { "documentId": "...", "organizationId": "cloudDocsId" },
    { "documentId": "...", "organizationId": "cloudDocsId" }
  ]
}
```

✅ NINGÚN chunk debe tener organizationId de TechCorp

---

#### Prueba 9.3: Usuario sin membresía no puede clasificar documentos

**Objetivo:** Control de acceso

**Pasos:**

1. Expulsar a John de CloudDocs
2. John intenta clasificar documento de CloudDocs

**Resultado Esperado:**

- Error 403

---

#### Prueba 9.4: Usuario invitado puede usar RAG

**Objetivo:** Permisos de guest

**Pasos:**

1. Crear usuario guest en organización
2. Guest intenta RAG: `POST /api/ai/ask`

**Resultado Esperado:**

- Status 200 (guest puede leer)

---

#### Prueba 9.5: Verificar organizationId en TODOS los chunks de MongoDB Atlas

**Objetivo:** Integridad de datos

**Pasos:**

1. Abrir MongoDB Compass → Atlas
2. Ejecutar query:

   ```javascript
   db.document_chunks.find({ organizationId: { $exists: false } })
   ```

**Resultado Esperado:**

- Resultado vacío (`0 documentos`)

**Si hay chunks sin organizationId:**

- ❌ BUG CRÍTICO - datos sin aislar

---

## 🔄 Módulo Procesamiento de Documentos

### 🧪 Grupo 10: Pipeline Completo

#### Prueba 10.1: Flujo completo: Subir → Extraer → Procesar → Preguntar

**Objetivo:** End-to-end happy path

**Pasos:**

1. `POST /api/documents/upload` - subir `invoice.pdf`
2. `GET /api/ai/documents/{id}/extract-text`
3. `POST /api/ai/documents/{id}/process` con texto extraído
4. `POST /api/ai/documents/{id}/ask` - preguntar "¿Cuál es el total?"

**Resultado Esperado:**

- Todos los pasos exitosos
- Respuesta RAG correcta

---

#### Prueba 10.2: Reprocesar documento existente

**Objetivo:** Actualizar chunks

**Pasos:**

1. Procesar documento → crear 5 chunks
2. `DELETE /api/ai/documents/{id}/chunks`
3. Verificar respuesta: `{ "deletedCount": 5 }`
4. Volver a procesar
5. Verificar nuevos chunks en Atlas

---

#### Prueba 10.3: Eliminar documento elimina chunks

**Objetivo:** Limpieza automática

**Pasos:**

1. Procesar documento
2. `DELETE /api/documents/{id}` (eliminar documento)
3. Verificar en Atlas que sus chunks también se eliminaron

**Query en Atlas:**

```javascript
db.document_chunks.find({ documentId: "..." })
// Debe retornar 0 documentos
```

---

#### Prueba 10.4: Procesamiento de múltiples documentos en batch

**Objetivo:** Rendimiento

**Pasos:**

1. Subir 10 documentos
2. Extraer texto de todos
3. Procesar todos en secuencia
4. Medir tiempo total

**Verificar:**

- ✅ Todos se procesan sin error
- ✅ Tiempo razonable (<5 min para 10 docs pequeños)

---

## 🔗 Módulo Integración End-to-End

### 🧪 Grupo 11: Escenarios Reales

#### Prueba 11.1: Escenario Facturación

**Objetivo:** Caso de uso real

**Pasos:**

1. Subir 5 facturas de diferentes proveedores (PDFs)
2. Procesar todas
3. Clasificar todas → verificar `category: "Factura"`
4. Preguntar: "¿Cuánto he gastado en total este mes?"
5. Verificar que RAG suma correctamente

---

#### Prueba 11.2: Escenario Contractual

**Objetivo:** Búsqueda legal

**Pasos:**

1. Subir 3 contratos diferentes
2. Procesar y clasificar
3. Preguntar: "¿Qué contratos vencen en 2026?"
4. Verificar que identifica fechas correctamente

---

#### Prueba 11.3: Escenario Multitenancy Completo

**Objetivo:** Dos organizaciones trabajando simultáneamente

**Pasos:**

1. Admin (CloudDocs) sube y procesa 3 documentos
2. Jane (TechCorp) sube y procesa 3 documentos
3. Admin pregunta sobre sus datos
4. Jane pregunta sobre sus datos
5. Verificar que NO hay cross-contamination

**Verificar:**

- Admin ve solo sus 3 docs
- Jane ve solo sus 3 docs

---

#### Prueba 11.4: Escenario OCR + RAG

**Objetivo:** Pipeline completo con imágenes

**Pasos:**

1. Subir factura escaneada (JPG)
2. Extraer texto via OCR
3. Procesar documento
4. Preguntar: "¿Cuál es el número de factura?"

**Resultado Esperado:**

- OCR extrae el número
- RAG responde correctamente

---

#### Prueba 11.5: Escenario Clasificación Automática

**Objetivo:** Sin intervención manual

**Pasos:**

1. Subir documento
2. Extraer texto
3. Clasificar automáticamente
4. Verificar en MongoDB que `aiCategory` y `aiTags` están completos
5. Buscar en Elasticsearch por categoría

**Verificar flujo automático:**

- ✅ Upload → Extract → Classify → Index en ES

---

## 📊 Resumen de Cobertura

| Módulo                 | Pruebas | Estado |
|------------------------|---------|--------|
| RAG General            | 10      | 🟢     |
| RAG Documento          | 5       | 🟢     |
| Clasificación          | 7       | 🟢     |
| Resumen                | 5       | 🟢     |
| OCR                    | 7       | 🟢     |
| Elasticsearch          | 9       | 🟢     |
| Extracción Texto       | 5       | 🟢     |
| Multitenancy           | 5       | 🟢     |
| Procesamiento          | 4       | 🟢     |
| Integración E2E        | 5       | 🟢     |
| **TOTAL**              | **56**  | 🟢     |

---

## ✅ Checklist de Ejecución

### Pre-requisitos Técnicos

- [ ] MongoDB local corriendo
- [ ] MongoDB Atlas configurado con índice vectorial
- [ ] Elasticsearch corriendo (si ES_ENABLED=true)
- [ ] OpenAI API Key válida o Ollama instalado
- [ ] Variables de entorno configuradas

### Datos de Prueba

- [ ] Seed ejecutado (`npm run seed:dev`)
- [ ] Documentos de prueba disponibles:
  - [ ] PDFs con texto
  - [ ] PDFs escaneados
  - [ ] DOCX
  - [ ] Imágenes PNG/JPG con texto
  - [ ] Archivo TXT

### Herramientas

- [ ] Postman o Thunder Client instalado
- [ ] MongoDB Compass abierto
- [ ] Navegador para Elasticsearch (opcional)

---

## 🐛 Reporte de Problemas

Para cada prueba fallida, documentar:

1. **Número de prueba:** Ej: 1.1
2. **Resultado obtenido:** Status code, mensaje de error
3. **Resultado esperado:** Lo que debería haber pasado
4. **Logs del servidor:** Copiar errores de consola
5. **Pasos para reproducir:** Secuencia exacta

### Template de Bug Report

```markdown
## Bug: [Título descriptivo]

**Prueba:** 1.1 - Extraer texto de PDF

**Severidad:** Alta / Media / Baja

**Pasos:**
1. Login como admin
2. Subir invoice.pdf
3. GET /api/ai/documents/xxx/extract-text

**Resultado Obtenido:**
- Status: 500
- Error: "Failed to extract text: pdf-parse error"

**Resultado Esperado:**
- Status: 200
- Texto extraído correctamente

**Logs:**
```

[text-extraction] Error extracting text: Cannot read property 'text' of undefined

```text

**Ambiente:**
- OS: Windows 11
- Node: 20.11.0
- MongoDB: 7.0.5
- OpenAI: gpt-4o-mini
```

---

## 📚 Recursos Adicionales

### Documentación del Proyecto

- [docs/AI-MODULE.md](./AI-MODULE.md) - Documentación técnica IA
- [docs/ENDPOINTS-TESTING-GUIDE.md](./ENDPOINTS-TESTING-GUIDE.md) - Guía de endpoints
- [docs/MULTITENANCY-RAG-TESTING.md](./MULTITENANCY-RAG-TESTING.md) - Tests de seguridad

### APIs Externas

- [OpenAI Embeddings Docs](https://platform.openai.com/docs/guides/embeddings)
- [MongoDB Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [Elasticsearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Tesseract.js Docs](https://tesseract.projectnaptha.com/)

### Colección Postman

Importar colección pre-configurada:

```json
{
  "info": { "name": "CloudDocs AI Tests" },
  "item": [
    {
      "name": "1. Auth",
      "item": [
        { "name": "Register", "request": { "method": "POST", "url": "{{baseUrl}}/api/auth/register" }},
        { "name": "Login", "request": { "method": "POST", "url": "{{baseUrl}}/api/auth/login" }}
      ]
    },
    {
      "name": "2. RAG",
      "item": [
        { "name": "Ask Question", "request": { "method": "POST", "url": "{{baseUrl}}/api/ai/ask" }},
        { "name": "Ask in Document", "request": { "method": "POST", "url": "{{baseUrl}}/api/ai/documents/:id/ask" }}
      ]
    }
  ]
}
```

Variable `baseUrl`: `http://localhost:4000`

---

## 🎯 Métricas de Éxito

Al finalizar las 56 pruebas:

- **✅ Éxito Total:** 56/56 pruebas pasando
- **⚠️ Éxito Parcial:** 50-55 pruebas OK (algunas features opcionales)
- **❌ Fallo:** <50 pruebas OK (requiere correcciones críticas)

### KPIs Clave

- Tasa de éxito RAG: >90%
- Precisión OCR: >80% en texto claro
- Tiempo respuesta RAG: <3 segundos
- Seguridad multitenancy: 100% (0 leaks permitidos)

---

**Fin del Plan de Pruebas** 🚀
