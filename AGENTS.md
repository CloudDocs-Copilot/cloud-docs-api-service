# AGENTS.md - Reglas de codificación para agentes

Este documento define reglas y lineamientos para agentes de codificación con IA que trabajan en el servicio CloudDocs API.

## Descripción general del proyecto

- **Tipo:** Backend de API REST
- **Stack:** Node.js 20+, Express.js, TypeScript 5.x, MongoDB (Mongoose), Elasticsearch (opcional)
- **Arquitectura:** En capas (Rutas → Controladores → Servicios → Modelos)
- **Autenticación:** Tokens JWT + protección CSRF

## Estructura de directorios

```schema
src/
├── configurations/     # Configuraciones de servicios externos (DB, CORS, ES)
├── controllers/        # Manejadores de solicitudes HTTP - validan y delegan
├── middlewares/        # Auth, CSRF, rate-limit, validación
├── models/            # Esquemas de Mongoose + tipos TypeScript
├── routes/            # Definiciones de rutas Express
├── services/          # Lógica de negocio - acceso a datos, transacciones
├── utils/             # Funciones auxiliares puras
├── mail/              # Plantillas de correo y servicio
└── docs/              # Especificación OpenAPI
```

## Patrones de código
### Controladores

Los controladores manejan solo las preocupaciones HTTP: analizar solicitudes y dar formato a respuestas:

```typescript
// ✅ Bueno - el controller delega al service
export const createDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, folderId } = req.body;
    const userId = req.user.id;

    const document = await documentService.create({ filename, folderId, userId });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
};

// ❌ Malo - lógica de negocio en el controller
export const createDocument = async (req: Request, res: Response) => {
  const document = new Document(req.body);
  await document.save(); // Debe estar en el service
  res.json(document);
};
```

### Servicios

Los servicios contienen la lógica de negocio y el acceso a datos:

```typescript
// ✅ Good - service handles business rules
export const documentService = {
  async create(data: CreateDocumentDto): Promise<IDocument> {
    // Validate business rules
    const folder = await Folder.findById(data.folderId);
    if (!folder) {
      throw new HttpError(404, 'Folder not found');
    }

    // Check quota
    const usage = await this.getStorageUsage(data.userId);
    if (usage >= MAX_STORAGE) {
      throw new HttpError(400, 'Storage quota exceeded');
    }

    // Create document
    return Document.create(data);
  }
};
```

### Modelos

Usa esquemas de Mongoose con interfaces TypeScript:

```typescript
// models/document.model.ts
export interface IDocument extends mongoose.Document {
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  folder?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new mongoose.Schema<IDocument>(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true }
    // ...
  },
  { timestamps: true }
);

export const Document = mongoose.model<IDocument>('Document', documentSchema);
```

### Manejo de errores

Siempre usa HttpError para errores de API:

```typescript
import HttpError from '../models/error.model';

// Lanzar con código de estado y mensaje
throw new HttpError(404, 'Document not found');
throw new HttpError(403, 'Access denied');
throw new HttpError(400, 'Invalid file type');

// El middleware de errores se encarga de dar formato a la respuesta
```

### Middlewares

Encadena middlewares en las rutas:

```typescript
// routes/document.routes.ts
router.post(
  '/',
  authenticate, // Verificar JWT
  requireOrganization, // Asegurar contexto de organización
  requireRole(['member', 'admin', 'owner']), // Verificar permisos
  uploadMiddleware.single('file'), // Manejar carga de archivo
  validateRequest(createDocumentSchema), // Validar body
  documentController.create
);
```

## Naming Conventions

| Type                 | Convention            | Example                                 |
| -------------------- | --------------------- | --------------------------------------- |
| Archivos             | kebab-case            | `user.service.ts`, `auth.middleware.ts` |
| Clases               | PascalCase            | `UserService`, `HttpError`              |
| Interfaces           | PascalCase + I prefix | `IUser`, `IDocument`                    |
| Funciones            | camelCase             | `getUserById`, `validatePassword`       |
| Constantes           | SCREAMING_SNAKE_CASE  | `MAX_FILE_SIZE`, `JWT_EXPIRES_IN`       |
| Variables de entorno | SCREAMING_SNAKE_CASE  | `MONGO_URI`, `JWT_SECRET`               |

## Linting

**ESLint está configurado para aplicar calidad de código y buenas prácticas de TypeScript.**

### Ejecutar ESLint

```bash
# Verificar errores y advertencias
npm run lint

# Auto-corregir problemas que se puedan corregir
npm run lint:fix

# Verificar con tolerancia cero a advertencias (para CI/CD)
npm run lint:check
```

### Reglas críticas (configuradas como ERROR)

Todos los usos de `any` están **PROHIBIDOS** y harán que falle el linting:

```typescript
// ❌ INCORRECTO - Fallará el linting
catch (error: any) { ... }
function process(data: any) { ... }
const items: any[] = [];

// ✅ CORRECTO - Usa tipos específicos o unknown
catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}

interface ProcessData {
  id: string;
  name: string;
}
function process(data: ProcessData) { ... }

type Item = { id: string; value: number };
const items: Item[] = [];
```

### Antes de hacer commit

Siempre ejecuta `npm run lint` y corrige todos los errores. Lo siguiente causará fallos de build:

- ❌ Usar el tipo `any` explícitamente
- ❌ Asignaciones inseguras desde valores `any`
- ❌ Acceder a miembros sobre valores `any`
- ❌ Llamar funciones tipadas como `any`
- ❌ Variables no usadas (a menos que tengan prefijo `_`)

Consulta [ESLINT-SETUP.md](ESLINT-SETUP.md) para ver los detalles completos de configuración.

## Testing

### Estructura de tests

```schema
tests/
├── unit/              # Tests unitarios aislados
│   ├── services/
│   └── utils/
├── integration/       # Tests de endpoints de API
├── builders/          # Fábricas de datos de prueba
├── fixtures/          # Datos estáticos de prueba
└── helpers/           # Utilidades de testing
```

### Patrones de prueba

```typescript
// Usa builders para datos de prueba
const user = new UserBuilder()
  .withEmail('test@example.com')
  .withRole('admin')
  .build();

// Usa nombres descriptivos para los tests
describe('DocumentService', () => {
  describe('create', () => {
    it('should create document when folder exists and quota not exceeded', async () => {
      // Arrange
      const folder = await FolderBuilder.create();

      // Act
      const doc = await documentService.create({ folderId: folder._id, ... });

      // Assert
      expect(doc).toBeDefined();
      expect(doc.folder).toEqual(folder._id);
    });

    it('should throw 404 when folder not found', async () => {
      await expect(documentService.create({ folderId: 'invalid' }))
        .rejects.toThrow('Folder not found');
    });
  });
});
```

## Reglas de diseño de API

1. **Endpoints RESTful** - Usa sustantivos, no verbos: `/api/documents`, no `/api/getDocuments`
2. **Respuestas consistentes** - Siempre devuelve `{ success: boolean, data?: T, error?: string }`
3. **Códigos de estado adecuados** - 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
4. **Paginación** - Usa `?page=1&limit=20` para listar endpoints
5. **Filtrado** - Usa query params: `?status=active&type=pdf`

## Reglas de seguridad

1. **Nunca confíes en el input del usuario** - Valida y sanitiza todo
2. **Usa consultas parametrizadas** - Mongoose maneja esto, pero ten cuidado con `$where`
3. **Hashea contraseñas** - Usa bcrypt con suficientes rondas (10+)
4. **Protege rutas** - Aplica middleware de auth a todos los endpoints protegidos
5. **Valida subida de archivos** - Verifica tipo MIME, tamaño y sanitiza el nombre del archivo
6. **Sanitiza rutas** - Usa path-sanitizer para operaciones con archivos

## NO HACER
- ❌ Poner lógica de negocio en controllers
- ❌ Usar el tipo any - usa unknown y type guards
- ❌ Hacer commit de archivos .env o secretos
- ❌ Usar eval() o el constructor Function()
- ❌ Confiar en rutas de archivo proporcionadas por el usuario
- ❌ Almacenar datos sensibles en el payload del JWT
- ❌ Omitir el manejo de errores en funciones async
- ❌ Usar operaciones síncronas de archivos en request handlers
- ❌ Hacer merge de código que rompa tests existentes
- ❌ Agregar funcionalidades sin tests correspondientes

## HACER
- ✅ Usar async/await con try-catch correcto
- ✅ Validar bodies de solicitudes con esquemas
- ✅ Registrar errores con contexto (pero no datos sensibles)
- ✅ Usar transacciones para operaciones de múltiples documentos
- ✅ Escribir tests para nuevas funcionalidades
- ✅ Documentar cambios de API en la especificación OpenAPI
- ✅ Usar variables de entorno para configuración
- ✅ Seguir los patrones de código existentes en el codebase
- ✅ Ejecutar todos los tests antes de hacer commit (npm test)
- ✅ Mantener o incrementar la cobertura de tests

## Requisitos de testing

### Mandatory Testing Rules

1. **Todos los tests deben pasar antes de hacer merge de cualquier cambio de código**

   ```bash
   npm test  # Debe salir con código 0
   ```

2. **Las nuevas funcionalidades deben incluir tests**
   - Tests unitarios para services y utilities
   - Tests de integración para endpoints de API
   - La cobertura no debe disminuir

3. **Los bug fixes deben incluir tests de regresión**
   - Agrega un test que hubiera detectado el bug
   - Verifica que el fix no rompa funcionalidad existente

4. **Requisitos de cobertura de tests**

   ```bash
   npm run test:coverage
   ```

   - Cobertura mínima general: 70%
   - El código nuevo debe tener >80% de cobertura
   - Rutas críticas (auth, payments) requieren >90% de cobertura

### Ejecutar tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar con reporte de cobertura
npm run test:coverage

# Ejecutar archivo de test específico
npm test -- tests/unit/services/auth.service.test.ts

# Ejecutar tests en modo watch (desarrollo)
npm run test:watch
```

### Pre-commit Checklist

Antes de hacer commit de cualquier cambio de código:

- [ ] `npm run lint` pasa (SIN errores relacionados con `any`)
- [ ] `npm test` pasa
- [ ] `npm run build` se completa correctamente
- [ ] La cobertura no ha disminuido
- [ ] Las nuevas funcionalidades tienen tests
- [ ] Especificación OpenAPI actualizada (si cambió la API)
- [ ] No hay tipos any en el código (usa `unknown` o tipos específicos)
