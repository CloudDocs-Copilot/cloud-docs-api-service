<div align="center">

# CloudDocs Copilot Backend (MVP)

API REST para la gestión de usuarios, documentos y carpetas en la nube.

Construido con **Node.js**, **Express**, **MongoDB (Mongoose)** y autenticación **JWT**.

</div>

## Características principales

- Registro y login de usuarios con hashing seguro (bcrypt)
- Emisión y validación de tokens JWT con lógica avanzada de invalidación
- Gestión de documentos: subida, descarga, listado, compartición y eliminación
- Gestión de carpetas y relación documento–carpeta
- Serialización segura de modelos (oculta `_id`, `password`, `__v`)
- Manejo centralizado de errores con modelo `HttpError`
- Middleware 404 (catch-all) y respuesta JSON consistente
- Organización en capas (Configuration / Routes / Controllers / Services / Models / Middlewares)
- Transformaciones `toJSON` y `toObject` con eliminación de campos sensibles
- Campos de auditoría automáticos (`createdAt`, `updatedAt` con `timestamps: true`)

## Estructura del proyecto

```
src/
	index.js                    # Bootstrap del servidor
	configurations/
		database-config/mongoDB.js# Conexión a MongoDB
	routes/                     # Definición de endpoints HTTP
	controllers/                # Lógica de orquestación HTTP
	services/                   # Reglas de negocio / acceso a datos
	models/                     # Esquemas Mongoose (User, Document, Folder, HttpError)
	middlewares/                # Auth avanzado, manejo de errores
uploads/                      # Almacen temporal de archivos cargados
storage/                      # Ubicación interna de documentos persistidos
util-default-config-data/
	mongo-backup/               # Respaldos de colecciones (Compass)
	postman/                    # Colección Postman de la API
```

## Modelos y campos clave

### User
- name, email (único), password (hash), role (user|admin)
- active (soft disable), tokenVersion, lastPasswordChange
- createdAt / updatedAt (timestamps)

### Document
- filename, originalname, url, uploadedBy (ref User)
- folder (opcional, ref Folder), uploadedAt (legado) + createdAt / updatedAt
- sharedWith: [User]

### Folder
- name, owner (User), documents []
- createdAt / updatedAt

## Seguridad y autenticación

El middleware de autenticación (`auth.middleware.js`) aplica múltiples validaciones al token:

1. Usuario existe y está activo
2. `tokenVersion` sincronizado (invalida tokens tras cambio de contraseña)
3. Cambio de email invalida el token
4. Cambios del documento de usuario (`updatedAt`) posteriores a la emisión invalidan
5. `lastPasswordChange` vs `iat` para invalidar tokens emitidos antes
6. Manejo específico de expiración y formato de token

La firma del token se realiza en `jwt.service.js` agregando `tokenCreatedAt` para comprobaciones adicionales.

## Variables de entorno (`.env`)

Ejemplo (`.env.example`):

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/clouddocs
JWT_SECRET=supersecretjwtkey
JWT_EXPIRES_IN=1h
BCRYPT_SALT_ROUNDS=10
```

## Scripts disponibles

| Script   | Descripción                                |
|----------|--------------------------------------------|
| `npm start` | Ejecuta el servidor en modo producción      |
| `npm run dev` | Inicia con Nodemon (recarga en caliente)  |
| `npm run format` | Formatea el código con Prettier        |

## Requisitos previos

- Node.js 18+ (recomendado)
- MongoDB en ejecución local o remoto
- Crear archivo `.env` basado en `.env.example`

## Instalación

```bash
git clone <repo-url>
cd clouddocs-backend
npm install
cp .env.example .env   # Editar valores sensibles
npm run dev
```

## Endpoints base

| Método | Ruta                        | Descripción |
|--------|-----------------------------|-------------|
| GET    | `/api`                      | Health check |
| POST   | `/api/auth/register`        | Registro usuario |
| POST   | `/api/auth/login`           | Login y obtención de JWT |
| PATCH  | `/api/auth/:id/password`    | Cambio de contraseña (autenticado) |
| POST   | `/api/documents/upload`     | Subir documento (autenticado) |
| GET    | `/api/documents`            | Listar documentos |
| DELETE | `/api/documents/:id`        | Eliminar documento |
| POST   | `/api/documents/:id/share`  | Compartir documento |
| GET    | `/api/folders`              | Listar carpetas |
| POST   | `/api/folders`              | Crear carpeta |

> Para más detalle importa la colección Postman incluida en `util-default-config-data/postman`.

## Manejo de errores

Los errores controlados lanzan `HttpError(statusCode, message, details)` y se responden con JSON:

```json
{
	"status": 401,
	"message": "Token invalidated due to password change"
}
```

Rutas inexistentes retornan:

```json
{ "status": 404, "message": "Route not found" }
```

## Subida de archivos

Se utiliza `multer` para manejar cargas. Los archivos se almacenan en `uploads/` y su metadata en MongoDB. Un servicio adicional puede moverlos a `storage/` (según implementación de negocio).

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
