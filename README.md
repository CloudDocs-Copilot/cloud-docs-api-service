<div align="center">

# CloudDocs Copilot Backend

API REST multi-tenant para la gestión de documentos en la nube con organizaciones y planes de suscripción.

**Tech Stack:** Node.js · Express · TypeScript · MongoDB (Mongoose) · JWT

[![Tests](https://img.shields.io/badge/tests-passing-success)]() 
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)]()
[![Node](https://img.shields.io/badge/Node.js-18+-green)]()

</div>

---

## 🚀 Características Principales

### Sistema Multi-Tenant
- **Membresías (N:N):** Usuarios pueden pertenecer a múltiples organizaciones
- **Roles Granulares:** owner, admin, member, viewer
- **Aislamiento de Datos:** Storage físico separado por organización
- **Organización Activa:** Contexto de trabajo por usuario

### Búsqueda de Documentos (Elasticsearch)
- **Indexación Automática:** Los documentos se indexan automáticamente al subir
- **Búsqueda Multi-Campo:** Búsqueda fuzzy en nombre, tipo y descripción
- **Autocompletado:** Sugerencias en tiempo real para búsqueda rápida
- **Filtros Avanzados:** Por organización, usuario, tipo de archivo y fechas

### Planes de Suscripción
- **FREE:** 3 usuarios, 1GB/usuario, 10MB/archivo, tipos limitados
- **BASIC:** 10 usuarios, 5GB/usuario, 50MB/archivo
- **PREMIUM:** 50 usuarios, 10GB/usuario, 100MB/archivo
- **ENTERPRISE:** Usuarios ilimitados, 50GB/usuario, 500MB/archivo

### Seguridad y Validación
- Autenticación JWT con invalidación avanzada
- Protección CSRF (Double Submit Cookie)
- Validación de contraseñas robusta
- Prevención de Path Traversal y NoSQL Injection
- Rate Limiting y sanitización de inputs

### Gestión de Documentos
- Upload con validación de plan (tamaño, tipo, cuota)
- Organización por carpetas jerárquicas
- Compartir documentos entre usuarios
- Download seguro con validación de permisos

## 📁 Estructura del Proyecto

```
src/
├── index.ts                    # Bootstrap del servidor
├── app.ts                      # Configuración de Express
├── configurations/
│   ├── database-config/        # Conexión a MongoDB
│   └── cors-config.ts          # Configuración CORS
├── routes/                     # Definición de endpoints HTTP
│   ├── auth.routes.ts
│   ├── organization.routes.ts
│   ├── membership.routes.ts    # 🆕 Rutas de membresías
│   ├── document.routes.ts
│   ├── folder.routes.ts
│   └── user.routes.ts
├── controllers/                # Lógica de orquestación HTTP
├── services/                   # Reglas de negocio / acceso a datos
│   ├── auth.service.ts
│   ├── membership.service.ts   # 🆕 Gestión de membresías
│   ├── organization.service.ts
│   ├── document.service.ts
│   └── ...
├── models/                     # Esquemas Mongoose
│   ├── user.model.ts
│   ├── organization.model.ts   # Con planes de suscripción
│   ├── membership.model.ts     # 🆕 Relación N:N User-Organization
│   ├── document.model.ts
│   └── folder.model.ts
├── middlewares/                # Auth, CSRF, validaciones
│   ├── auth.middleware.ts
│   ├── csrf.middleware.ts
│   ├── organization.middleware.ts
│   └── ...
└── utils/                      # Utilidades (validators, sanitizers)

storage/                        # Storage físico por organización
├── {org-slug}/
│   └── {userId}/              # Archivos del usuario en esa org
tests/                          # Suite completa de tests
├── integration/
├── unit/
├── builders/
├── fixtures/
└── helpers/
```

## 🗄️ Modelos de Datos

### Membership (Nueva Entidad Central)
Relación muchos-a-muchos User ↔ Organization con metadatos.

```typescript
interface IMembership {
  user: ObjectId;           // Usuario
  organization: ObjectId;   // Organización
  role: MembershipRole;     // owner | admin | member | viewer
  status: MembershipStatus; // active | pending | suspended
  rootFolder: ObjectId;     // Carpeta raíz de esta membresía
  joinedAt: Date;
  invitedBy?: ObjectId;
}
```

### Organization
```typescript
interface IOrganization {
  name: string;
  slug: string;                    // URL-safe ID único
  owner: ObjectId;                 // Usuario propietario
  plan: SubscriptionPlan;          // FREE | BASIC | PREMIUM | ENTERPRISE
  settings: {
    maxUsers: number;
    maxStoragePerUser: number;     // Bytes
    maxStorageTotal: number;
    maxFileSize: number;
    allowedFileTypes: string[];
  };
  active: boolean;
}
```

### User
```typescript
interface IUser {
  n⚙️ Requisitos Previos

- **Node.js 18+** (recomendado v20)
- **MongoDB 6.0+** en ejecución (local o remoto)
- **Elasticsearch 8.11+** para búsqueda de documentos
- **Docker** (opcional, para usar docker-compose)
- **TypeScript 5.x**

## 🔧 Instalación

### Opción 1: Con Docker Compose (Recomendado)

```bash
# Clonar repositorio
git clone https://github.com/CloudDocs-Copilot/cloud-docs-api-service.git
cd cloud-docs-api-service

# Levantar MongoDB y Elasticsearch
docker-compose up -d

# Verificar que los servicios estén corriendo
docker-compose ps

# Instalar dependencias de Node.js
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Iniciar en desarrollo
npm run dev
```

### Opción 2: Instalación Manual

```bash
# Clonar repositorio
git clone https://github.com/CloudDocs-Copilot/cloud-docs-api-service.git
cd cloud-docs-api-service

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Asegúrate de tener MongoDB y Elasticsearch corriendo manualmente

# Iniciar en desarrollo
npm run dev

# Compilar TypeScript
npm run build

# Ejecutar en producción
npm start
```

## 🌐 Variables de Entorno

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/clouddocs
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=1h
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:4200
BCRYPT_SALT_ROUNDS=10

# Elasticsearch Configuration
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=    # Opcional (dejar vacío para desarrollo)
ELASTICSEARCH_PASSWORD=    # Opcional (dejar vacío para desarrollo)Document {
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  path: string;                    // Path físico
  organization: ObjectId;          // Organización (obligatorio)
  folder: ObjectId;                // Carpeta contenedora
  uploadedBy: ObjectId;
  sharedWith: ObjectId[];
}
```

### Folder
```typescript
interface IFolder {
  name: string;
  displayName?: string;
  type: FolderType;               // root | folder | shared
  owner: ObjectId;
  organization: ObjectId;
  parent: ObjectId | null;
  permissions: IFolderPermission[]; // Permisos granulares
  sharedWith: ObjectId[];
}
```


```
PORT=4000
MONGO_URI=mongodb://localhost:27017/clouddocs
JWT_SECRET=supersecretjwtkey
JWT_EXPIRES_IN=1h
BCRYPT_SALT_ROUNDS=10
```

## Scripts disponibles
📡 Endpoints Principales

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registro de usuario (sin org requerida) |
| POST | `/api/auth/login` | Login y obtención de JWT |
| GET | `/api/auth/me` | Información del usuario autenticado |

### Organizaciones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/organizations` | Crear organización (con plan) |
| GET | `/api/organizations` | Listar mis organizaciones |
| GET | `/api/organizations/:id` | Obtener organización |
| POST | `/api/organizations/:id/members` | Invitar usuario |
| D🔄 Flujo de Trabajo Multi-Tenant

1. **Usuario se registra** (sin organización)
```bash
POST /api/auth/register
{ "name": "Juan", "email": "juan@example.com", "password": "SecurePass123!" }
```

2. **Crea organización** (plan FREE por defecto)
```bash
POST /api/organizations
{ "name": "Mi Empresa", "plan": 0 }
# Sistema crea Membership automáticamente con rootFolder
```

3. **Sube documento** (validado contra límites del plan)
```bash
POST /api/documents/upload
FormData { file: archivo.pdf }
# Plan FREE: max 10MB, solo pdf/txt/doc/docx
```

4. **Invita usuarios** (validado contra maxUsers del plan)
```bash
POST /api/organizations/{orgId}/members
{ "userId": "user456" }
# Plan FREE: máximo 3 usuarios
```

5. **Cambia entre organizaciones**
```bash
POST /api/memberships/switch/{orgId}
# Cambia contexto de trabajo
```

## ⚠️ Manejo de Errores

Respuestas de error estandarizadas:

```json
{
  "success": false,
  "message": "File size exceeds plan limit of 10 MB"
}
```

```json
{🧪 Testing

Suite completa de tests con **Jest**, **Supertest** y **MongoDB Memory Server**.

```bash
# Ejecutar todos los tests
npm test

# Con cobertura de código
npm run test:coverage

# En modo watch
npm run test:watch

# Tests específicos
npm test -- auth.test.ts
npm test -- documents.test.ts
```

### Estructura de Tests

```
tests/
├── integration/     # Tests de endpoints completos (198 tests)
│   ├── auth.test.ts
│   ├── documents.test.ts
│   ├── folders.test.ts
│   ├── password-validation.test.ts
│   └── url-path-security.test.ts
├── unit/           # Tests unitarios de servicios
│   └── jwt.service.test.ts
├── builders/       # Patrón Builder para objetos de prueba
├── fixtures/       # Datos de prueba predefinidos
├── helpers/        # Funciones auxiliares
└── setup.ts        # Configuración global (MongoDB Memory Server)
```

📚 **Documentación completa:** [tests/TEST-GUIDE.md](tests/TEST-GUIDE.md)details)` y se responden con JSON:

```json
{
	"status": 401,
	"message": "Token invalidated due to password change"
}
```

Rut📚 Documentación

### Documentación API (Swagger)
- **Swagger UI:** http://localhost:3000/api/docs
- **JSON spec:** http://localhost:3000/api/docs.json

### Documentación del Proyecto

| Documento | Descripción |
|-----------|-------------|
| [MULTITENANCY-MIGRATION.md](MULTITENANCY-MIGRATION.md) | Arquitectura multi-tenant con Membresías |
| [ENDPOINTS-TESTING-GUIDE.md](ENDPOINTS-TESTING-GUIDE.md) | Guía completa de testing de endpoints |
| [MIGRATION-COMPLETED.md](MIGRATION-COMPLETED.md) | Resumen de implementación |
| [tests/TEST-GUIDE.md](tests/TEST-GUIDE.md) | Guía de testing con fixtures y builders |

### Documentación de Seguridad

| Documento | Descripción |
|-----------|-------------|
| [SECURITY-FIXES.md](SECURITY-FIXES.md) | Correcciones de Path Traversal y NoSQL Injection |
| [CSRF-PROTECTION.md](CSRF-PROTECTION.md) | Implementación de protección CSRF |
| [PASSWORD-VALIDATION.md](PASSWORD-VALIDATION.md) | Sistema de validación de contraseñas |

## 🎨 Estilo de Código

Prettier configurado vía `.prettierrc.json`:

```bash
npm run format
```

## 🗂️ Recursos Adicionales

- **Postman Collection:** `util-default-config-data/postman/TFM.postman_collection.json`
- **MongoDB Backups:** `util-default-config-data/mongo-backup/`

## 📋 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm start` | Ejecuta servidor en producción |
| `npm run dev` | Desarrollo con Nodemon (hot reload) |
| `npm run build` | Compila TypeScript a JavaScript |
| `npm test` | Ejecuta suite de tests |
| `npm run test:coverage` | Genera reporte de cobertura |
| `npm run format` | Formatea código con Prettier |

## 🔐 Características de Seguridad

- ✅ **Autenticación JWT** con invalidación avanzada (tokenVersion)
- ✅ **CSRF Protection** (Double Submit Cookie con csrf-csrf)
- ✅ **Password Validation** (8+ chars, mayúsculas, números, símbolos)
- ✅ **Path Traversal Prevention** (sanitización de paths)
- ✅ **NoSQL Injection Prevention** (express-mongo-sanitize)
- ✅ **Rate Limiting** (express-rate-limit)
- ✅ **Helmet** (Headers de seguridad HTTP)
- ✅ **CORS** configurado por entorno

## 🚀 Deployment

```bash
# Compilar para producción
npm run build

# Establecer variables de entorno de producción
export NODE_ENV=production
export MONGODB_URI=mongodb://your-production-db
export JWT_SECRET=your-production-secret

# Iniciar servidor
npm start
```

## 📄 Licencia

Este es un proyecto educativo/demostrativo para TFM (Trabajo Fin de Máster).

---

## 👥 Contribuir

1. Fork el proyecto
2. Crea una rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

**Versión:** 3.0.0 (Sistema Multi-Tenant con Membresías)  
**Última actualización:** Enero 2025

# Con cobertura de código
npm run test:coverage

# En modo watch
npm run test:watch

# Solo tests de integración
npm test -- tests/integration

# Solo tests unitarios
npm test -- tests/unit
```

### Configuración de tests

Los tests usan una base de datos separada. Configurar en `.env.test`:

```
TEST_MONGO_URI=mongodb://127.0.0.1:27017/clouddocs-test
JWT_SECRET=test-secret-key
```

**Importante:** Asegúrate de que MongoDB esté corriendo antes de ejecutar los tests.

Para más detalles, consulta [tests/README.md](tests/README.md).

## Documentación API (Swagger)

La API está documentada con OpenAPI/Swagger. Una vez iniciado el servidor:

- **Swagger UI:** http://localhost:4000/api/docs
- **JSON spec:** http://localhost:4000/api/docs.json

## Estilo de código

Prettier configurado vía `.prettierrc.json`. Ejecutar:

```bash
npm run format
```



## Respaldos y documentación

En `util-default-config-data/mongo-backup` hay respaldos de colecciones para referencia/migración.
En `util-default-config-data/postman` está la colección Postman para importar en tu cliente.

## Licencia

MVP interno educativo/demostrativo. Añadir licencia formal si se abre el código públicamente.

---

¿Necesitas ampliar algo (tests, validación, Swagger)? Abre un issue o continúa el desarrollo.
