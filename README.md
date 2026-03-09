<div align="center">

# CloudDocs API Service

API REST multi-tenant para gestión de documentos en la nube con funcionalidades impulsadas por IA: RAG, clasificación, resumido y búsqueda semántica.

**Stack tecnológico:** Node.js · Express · TypeScript · MongoDB · OpenAI / Ollama · Elasticsearch

[![Node](https://img.shields.io/badge/Node.js-20+-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

</div>


---

## ✨ Funcionalidades

- **Arquitectura Multi-tenant** - Los usuarios pertenecen a múltiples organizaciones con acceso basado en roles
- **Gestión de documentos** - Subir, organizar y compartir documentos con jerarquía de carpetas
- **Búsqueda de texto completo** - Búsqueda impulsada por Elasticsearch en todos los documentos (opcional)
- **Planes de suscripción** - FREE, BASIC, PREMIUM, ENTERPRISE con cuotas de almacenamiento
- **Seguridad** - Autenticación JWT, protección CSRF, limitación de tasa, sanitización de entradas

### Funcionalidades de IA (Módulo RAG)

- **Preguntas y respuestas RAG** - Haz preguntas en lenguaje natural sobre los documentos de una organización o sobre un documento específico
- **Clasificación de documentos** - Categorización automática con puntuaciones de confianza y etiquetas
- **Resumido de documentos** - Resúmenes generados por IA con extracción de puntos clave
- **Extracción de texto** - Soporte para PDF, DOCX, DOC, TXT, MD con fragmentación inteligente
- **Búsqueda vectorial** - MongoDB Atlas `$vectorSearch` con similitud coseno
- **Abstracción de proveedor** - Cambia entre OpenAI, Ollama (local/gratis) o proveedores Mock mediante una sola variable de entorno
- **Aislamiento Multi-tenant** - Los resultados RAG se filtran estrictamente por organización

> 📖 Consulta [docs/AI-MODULE.md](docs/AI-MODULE.md) para la documentación completa del módulo de IA y [docs/AI-SETUP-GUIDE.md](docs/AI-SETUP-GUIDE.md) para instrucciones de configuración.

## 🚀 Inicio rápido

### Prerrequisitos

- Node.js 20+
- Docker (para MongoDB)
- npm o yarn

### Desarrollo local (5 minutos)

```bash
# 1. Clonar e instalar
git clone <repository-url>
cd cloud-docs-api-service
npm install

# 2. Iniciar MongoDB con Docker
docker run -d --name mongodb -p 27017:27017 mongo:6.0

# 3. Iniciar el servidor de desarrollo
npm run dev

# 4. (Opcional) Cargar datos de prueba
npm run seed:dev
```

**¡Eso es todo!** La API ahora está corriendo en <http://localhost:4000>

> **Nota:** La app carga automáticamente `.env.example` como valores predeterminados, así que no se requiere configuración manual de `.env` para desarrollo básico. Para sobrescribir cualquier variable, crea un archivo `.env.local` (ignorado por git):
> ```bash
> cp .env.example .env.local
> # Edita solo las variables que necesitas cambiar
> ```

### Habilitar funcionalidades de IA

Las funcionalidades de IA requieren configuración adicional. Elige uno de tres proveedores:

| Provider | Cost | Requirements |
|----------|------|--------------|
| **Mock** | Free | Nothing — deterministic responses for testing |
| **Ollama** | Free | [Ollama](https://ollama.com) installed locally |
| **OpenAI** | Paid | OpenAI API key + MongoDB Atlas (vector search) |

**Inicio rápido con Ollama (gratis, local):**

```bash
# 1. Instalar Ollama (macOS)
brew install ollama

# 2. Descargar los modelos requeridos
ollama pull llama3.2:3b
ollama pull nomic-embed-text

# 3. Configurar el proveedor en .env.local
echo 'AI_PROVIDER=ollama' >> .env.local
```

**Inicio rápido con Mock (pruebas, sin configuración):**

```bash
echo 'AI_PROVIDER=mock' >> .env.local
```

> 📖 Consulta [docs/AI-SETUP-GUIDE.md](docs/AI-SETUP-GUIDE.md) para las instrucciones completas, incluida la configuración de OpenAI y MongoDB Atlas.

### Cuentas de prueba (después del seeding)

| Email                 | Password  | Role  |
| --------------------- | --------- | ----- |
| admin@clouddocs.local | Test@1234 | Admin |
| john@clouddocs.local  | Test@1234 | User  |
| jane@clouddocs.local  | Test@1234 | User  |

Consulta [docs/MOCK-DATA.md](docs/MOCK-DATA.md) para la documentación completa de los datos de prueba.

### Usando Docker Compose (stack completo)

```bash
# Desde la raíz del workspace (directorio padre)
cp .env.example .env.local
# Edita .env.local con tu configuración
docker-compose up -d

# API disponible en http://localhost:4000
# Frontend en http://localhost:3000
```

## 🤖 Endpoints de la API de IA

Todos los endpoints de IA requieren autenticación y están bajo `/api/ai`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ai/ask` | Haz una pregunta sobre todos los documentos de la organización (RAG) |
| `POST` | `/ai/documents/:id/ask` | Haz una pregunta sobre un documento específico |
| `GET` | `/ai/documents/:id/extract-text` | Extrae el contenido de texto de un documento |
| `POST` | `/ai/documents/:id/process` | Fragmenta e incrusta un documento para RAG |
| `DELETE` | `/ai/documents/:id/chunks` | Elimina los fragmentos procesados de un documento |
| `POST` | `/ai/documents/:id/classify` | Clasifica el documento (categoría, confianza, etiquetas) |
| `POST` | `/ai/documents/:id/summarize` | Resume el documento (resumen + puntos clave) |

> 📖 Consulta [docs/AI-MODULE.md](docs/AI-MODULE.md) para la documentación detallada de endpoints con ejemplos de request/response.

## 📚 Documentación

| Document                                              | Description                             |
| ----------------------------------------------------- | --------------------------------------- |
| [AI Module](docs/AI-MODULE.md)                        | **Documentación completa del módulo IA/RAG** |
| [AI Setup Guide](docs/AI-SETUP-GUIDE.md)              | **Configuración del proveedor de IA (local y producción)** |
| [Architecture](docs/ARCHITECTURE.md)                  | Diseño del sistema y organización del código |
| [Phase Status Report](docs/PHASE-STATUS-REPORT.md)    | Seguimiento del progreso de implementación de IA |
| [Test Configuration](docs/TEST-CONFIGURATION.md)      | Configuración de pruebas y de CI |
| [OpenAPI Spec](docs/openapi/openapi.json)             | Especificación de API (Swagger/OpenAPI 3.0) |
| [Mock Data](docs/MOCK-DATA.md)                        | Datos de prueba para desarrollo local |
| [Testing Guide](docs/ENDPOINTS-TESTING-GUIDE.md)      | Cómo probar endpoints de API |
| [Contributing](CONTRIBUTING.md)                       | Configuración y lineamientos de desarrollo |

### RFCs (documentos de diseño técnico)

| Document                                               | Description                         |
| ------------------------------------------------------ | ----------------------------------- |
| [CSRF Protection](docs/rfc/CSRF-PROTECTION.md)         | Detalles de implementación de seguridad |
| [Multi-tenancy](docs/rfc/MULTITENANCY-MIGRATION.md)    | Explicación del modelo de organización |
| [Password Validation](docs/rfc/PASSWORD-VALIDATION.md) | Requisitos de fortaleza de contraseña |
| [Security Fixes](docs/rfc/SECURITY-FIXES.md)           | Documentación de mejoras de seguridad |

### RFEs (propuestas de mejora de funcionalidades de IA)

| Document                                                                            | Status |
| ----------------------------------------------------------------------------------- | ------ |
| [RFE-AI-001 Provider Abstraction](docs/RFE/RFE-AI-001-PROVIDER-ABSTRACTION.md)     | ✅ Implementado |
| [RFE-AI-002 Document Model AI Fields](docs/RFE/RFE-AI-002-DOCUMENT-MODEL-AI-FIELDS.md) | Propuesto |
| [RFE-AI-003 Classification & Tagging](docs/RFE/RFE-AI-003-CLASSIFICATION-TAGGING.md) | ✅ Implementado |
| [RFE-AI-004 ES Content Search Fix](docs/RFE/RFE-AI-004-FIX-ES-CONTENT-SEARCH.md)  | ✅ Implementado |
| [RFE-AI-005 Cross-Org RAG Fix](docs/RFE/RFE-AI-005-FIX-CROSS-ORG-RAG.md)          | ✅ Implementado |
| [RFE-AI-006 OCR with Tesseract](docs/RFE/RFE-AI-006-OCR-TESSERACT.md)              | Propuesto |
| [RFE-AI-007 Summarization](docs/RFE/RFE-AI-007-SUMMARIZATION.md)                   | ✅ Implementado |

## 🛠️ Scripts

| Script                     | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `npm run dev`              | Iniciar servidor de desarrollo con hot reload |
| `npm run build`            | Compilar TypeScript a JavaScript |
| `npm start`                | Ejecutar servidor de producción |
| **Testing**                |                                                |
| `npm run test:ci`          | **Ejecutar TODOS los tests + cobertura (usar en CI)** ⭐ |
| `npm test`                 | Ejecutar suite principal de tests (integración + la mayoría de unitarios) |
| `npm run test:unit`        | Ejecutar solo tests unitarios (incluye tests de embeddings) |
| `npm run test:integration` | Ejecutar solo tests de integración |
| `npm run test:coverage`    | Ejecutar tests con reporte de cobertura |
| `npm run test:watch`       | Ejecutar tests en modo watch |
| **Utilities**              |                                                |
| `npm run seed:dev`         | Cargar datos de prueba en la base de datos |
| `npm run format`           | Formatear código con Prettier |

## 📁 Estructura del proyecto

```text
├── docs/
│   ├── openapi/          # Especificaciones OpenAPI/Swagger
│   ├── rfc/              # Documentos de diseño técnico (RFCs)
│   └── RFE/              # Propuestas de mejora de funcionalidades de IA (RFEs)
├── scripts/
│   ├── seed-dev.ts               # Carga de datos de desarrollo
│   ├── clean-orphaned-documents.ts  # Limpieza de registros huérfanos en DB
│   ├── reindex-documents.ts      # Reindexar documentos en Elasticsearch
│   └── migrate-add-org-to-chunks.ts # Agregar organizationId a chunks
├── src/
│   ├── configurations/   # Configuraciones de base de datos, CORS, Elasticsearch, OpenAI
│   ├── controllers/      # Manejadores de solicitudes HTTP (incl. ai.controller)
│   ├── middlewares/       # Auth, CSRF, rate-limit, validación
│   ├── models/            # Esquemas de Mongoose y tipos TypeScript
│   ├── routes/            # Definiciones de rutas de API (incl. ai.routes)
│   ├── services/
│   │   ├── ai/            # Capa de servicios de IA
│   │   │   ├── providers/ # Implementaciones de proveedores OpenAI, Ollama, Mock
│   │   │   ├── embedding.service.ts
│   │   │   ├── llm.service.ts
│   │   │   ├── rag.service.ts
│   │   │   ├── text-extraction.service.ts
│   │   │   └── prompt.builder.ts
│   │   └── ...            # Otros servicios de lógica de negocio
│   └── utils/             # Funciones auxiliares (incl. chunking.util)
└── tests/
    ├── integration/       # Tests de integración de API (incl. tests de IA)
    └── unit/              # Tests unitarios (incl. tests de servicios de IA)
```

Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para la documentación detallada.

## 🔐 Funcionalidades de seguridad

- Autenticación JWT con invalidación de token
- Protección CSRF (Double Submit Cookie)
- Validación de fortaleza de contraseña
- Prevención de inyección NoSQL
- Protección contra path traversal
- Rate limiting por IP
- Headers de seguridad HTTP (Helmet)
- Aislamiento multi-tenant para búsqueda RAG/vectorial

## 🌐 Variables de entorno

Variables clave (consulta [.env.example](.env.example) para la lista completa):

| Variable                | Description               | Default                               |
| ----------------------- | ------------------------- | ------------------------------------- |
| `PORT`                  | Puerto del servidor       | `4000`                                |
| `MONGO_URI`             | Cadena de conexión de MongoDB | `mongodb://localhost:27017/clouddocs` |
| `JWT_SECRET`            | Clave de firma del token  | -                                     |
| `ELASTICSEARCH_ENABLED` | Habilitar búsqueda        | `false`                               |
| `ALLOWED_ORIGINS`       | Orígenes permitidos por CORS | `http://localhost:5173`            |

### Variables específicas de IA

| Variable               | Description                          | Default                      |
| ---------------------- | ------------------------------------ | ---------------------------- |
| `AI_PROVIDER`          | Proveedor: `openai` / `ollama` / `mock` | `openai`                    |
| `OPENAI_API_KEY`       | API key de OpenAI (cuando se usa openai) | -                         |
| `MONGO_ATLAS_URI`      | URI de MongoDB Atlas (búsqueda vectorial) | -                        |
| `OLLAMA_BASE_URL`      | URL del servidor Ollama              | `http://localhost:11434`     |
| `OLLAMA_CHAT_MODEL`    | Modelo de chat de Ollama             | `llama3.2:3b`               |
| `OLLAMA_EMBEDDING_MODEL` | Modelo de embeddings de Ollama     | `nomic-embed-text`           |

> 📖 Consulta [docs/AI-SETUP-GUIDE.md](docs/AI-SETUP-GUIDE.md) para instrucciones detalladas de configuración para cada proveedor.

## 🧪 Testing

```bash
# CI/CD - Ejecutar TODOS los tests con cobertura combinada (recomendado)
npm run test:ci

# Desarrollo
npm test                    # Suite principal
npm run test:unit           # Solo tests unitarios
npm run test:integration    # Solo tests de integración
npm run test:watch          # Modo watch
npm run test:coverage       # Con reporte de cobertura
```

**Funcionalidades:**

- ✅ Configuraciones duales de Jest para pruebas óptimas
- ✅ MongoDB Memory Server - no se requiere base de datos externa
- ✅ Tests de proveedores de IA (proveedor Mock para pruebas determinísticas)
- ✅ Tests de aislamiento RAG multi-tenant
- ✅ Fusión automática de cobertura en CI

> 📖 Consulta [docs/TEST-CONFIGURATION.md](docs/TEST-CONFIGURATION.md) para la documentación detallada de testing

## 📄 Licencia

Licencia MIT - consulta [LICENSE](LICENSE) para más detalles.

---

<div align="center">

**[Documentation](docs/)** · **[Report Bug](../../issues)** · **[Request Feature](../../issues)**

</div>
