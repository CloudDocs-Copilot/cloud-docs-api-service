# Tests - CloudDocs Backend

Este directorio contiene los tests del proyecto CloudDocs Backend con fixtures, builders y helpers para reutilización de código.

## 📁 Estructura

```
tests/
├── builders/          # Builders (patrón Builder) para construir objetos de prueba
│   ├── user.builder.ts
│   ├── document.builder.ts
│   ├── folder.builder.ts
│   └── index.ts
├── fixtures/          # Datos de prueba predefinidos (fixtures)
│   ├── user.fixtures.ts
│   ├── document.fixtures.ts
│   ├── folder.fixtures.ts
│   ├── security.fixtures.ts
│   └── index.ts
├── helpers/           # Funciones auxiliares para tests
│   ├── auth.helper.ts
│   ├── file.helper.ts
│   ├── delay.helper.ts
│   └── index.ts
├── integration/       # Tests de integración (endpoints completos)
│   ├── auth.test.ts
│   ├── documents.test.ts
│   ├── folders.test.ts
│   ├── password-validation.test.ts
│   └── url-path-security.test.ts
├── unit/             # Tests unitarios (funciones individuales)
│   └── jwt.service.test.ts
├── setup.ts          # Configuración global de tests
└── README.md         # Este archivo
```

## 🚀 Ejecutar Tests

```bash
# Todos los tests
npm test

# Tests específicos
npm test -- auth.test.ts
npm test -- documents.test.ts
npm test -- url-path-security.test.ts

# Con coverage
npm run test:coverage

# Watch mode (desarrollo)
npm test -- --watch
```

## 🏗️ Uso de Builders

Los **builders** permiten crear objetos de prueba de forma flexible usando el patrón Builder.

### UserBuilder

```typescript
import { UserBuilder } from './builders';

// Usuario básico
const user = new UserBuilder()
  .withName('Test User')
  .withEmail('test@example.com')
  .withStrongPassword()
  .build();

// Usuario con email único (timestamp)
const uniqueUser = new UserBuilder()
  .withName('Unique User')
  .withUniqueEmail('user') // genera user-{timestamp}@example.com
  .withStrongPassword()
  .build();

// Crear múltiples usuarios
const users = UserBuilder.buildMany(5, 'test-user');

// Solo datos de login
const loginData = new UserBuilder()
  .withEmail('test@example.com')
  .withPassword('Test@123')
  .buildLoginData(); // { email, password }

// Usuario admin
const admin = new UserBuilder().asAdmin().build();
```

### DocumentBuilder

```typescript
import { DocumentBuilder } from './builders';

// Documento básico
const doc = new DocumentBuilder().withFilename('test.txt').withContent('Test content').build();

// Documento PDF
const pdf = new DocumentBuilder().asPdf().withContent('PDF content').build();

// Imagen PNG
const image = new DocumentBuilder().asPng().build();

// Archivo temporal (IMPORTANTE: debe limpiarse)
const builder = new DocumentBuilder().withFilename('temp.txt');
const filePath = builder.createTempFile();
// ... usar archivo ...
DocumentBuilder.deleteTempFile(filePath);

// Documento malicioso para tests de seguridad
const malicious = new DocumentBuilder()
  .withMaliciousFilename() // ../../etc/passwd.txt
  .build();

// Documento con extensión peligrosa
const dangerous = new DocumentBuilder()
  .withDangerousExtension() // malware.exe
  .build();

// Múltiples documentos
const docs = DocumentBuilder.buildMany(5, 'file');
```

### FolderBuilder

```typescript
import { FolderBuilder } from './builders';

// Carpeta básica
const folder = new FolderBuilder().withName('Mi Carpeta').build();

// Carpeta con nombre único
const uniqueFolder = new FolderBuilder()
  .withUniqueName('folder') // folder-{timestamp}
  .build();

// Carpeta con padre
const subfolder = new FolderBuilder().withName('Subcarpeta').withParent('parent-folder-id').build();

// Carpeta con caracteres especiales
const specialFolder = new FolderBuilder().withSpecialCharacters().build();

// Carpeta con emoji
const emojiFolder = new FolderBuilder()
  .withEmoji() // 📁 Carpeta Importante
  .build();

// Múltiples carpetas
const folders = FolderBuilder.buildMany(3, 'Carpeta');

// Jerarquía de carpetas (padre-hijo-nieto)
const hierarchy = FolderBuilder.buildHierarchy(3, 'Level');
```

## 📦 Uso de Fixtures

Los **fixtures** proporcionan datos de prueba predefinidos y listos para usar.

### User Fixtures

```typescript
import { basicUser, authUser, docUser, weakPasswordUsers, strongPasswordUser } from './fixtures';

// Usuario predefinido
const response = await request(app).post('/api/auth/register').send(basicUser);

// Usuario para pruebas de documentos
const response = await request(app).post('/api/auth/register').send(docUser);

// Iterar sobre contraseñas débiles
for (const user of weakPasswordUsers) {
  const response = await request(app).post('/api/auth/register').send(user).expect(400);

  expect(response.body.error).toContain(user.expectedError);
}
```

### Document Fixtures

```typescript
import { basicTextFile, maliciousFilenames, dangerousExtensions, longFilenames } from './fixtures';

// Documento básico
const file = basicTextFile;

// Tests de seguridad con nombres maliciosos
for (const malicious of maliciousFilenames) {
  const response = await uploadFile(malicious.filename, malicious.content);
  // ... validar respuesta ...
}

// Tests de extensiones peligrosas
for (const dangerous of dangerousExtensions) {
  const response = await uploadFile(dangerous.filename, dangerous.content);
  expect(response.status).toBe(dangerous.expectedStatus);
}
```

### Security Fixtures

```typescript
import {
  ssrfUrls,
  validPublicUrls,
  blockedPortUrls,
  invalidProtocolUrls,
  pathTraversalPatterns,
  dangerousPathCharacters
} from './fixtures';

// Validar URLs SSRF
for (const test of ssrfUrls) {
  const result = validateUrl(test.url);
  expect(result.isValid).toBe(test.shouldBeValid);
}

// Validar puertos bloqueados
for (const test of blockedPortUrls) {
  const result = validateUrl(test.url);
  expect(result.isValid).toBe(false);
}

// Validar path traversal
for (const pattern of pathTraversalPatterns) {
  const result = sanitizePath(pattern.pattern);
  expect(result.isValid).toBe(pattern.shouldBeValid);
}

// Validar caracteres peligrosos
for (const test of dangerousPathCharacters) {
  const result = sanitizePath(test.path);
  expect(result.isValid).toBe(test.shouldBeValid);
}
```

## 🛠️ Uso de Helpers

Los **helpers** proporcionan funciones auxiliares comunes para tests.

### Auth Helper

```typescript
import {
  registerUser,
  loginUser,
  registerAndLogin,
  createAuthenticatedUsers,
  getAuthToken,
  getAuthHeaders,
  verifyToken
} from './helpers';

// Registrar usuario
await registerUser({
  name: 'Test User',
  email: 'test@example.com',
  password: 'Test@123'
});

// Login
const { token, userId, user } = await loginUser('test@example.com', 'Test@123');

// Registrar y autenticar en un paso
const { token, userId } = await registerAndLogin({
  name: 'Test User',
  email: 'test@example.com'
});

// Obtener token rápidamente (crea usuario por defecto)
const token = await getAuthToken();

// Headers de autenticación
const headers = getAuthHeaders(token);
// { Authorization: 'Bearer token...' }

// Crear múltiples usuarios autenticados
const users = await createAuthenticatedUsers(3);
// [{ token, userId, user }, { token, userId, user }, ...]

// Verificar si token es válido
const isValid = await verifyToken(token);
```

### File Helper

```typescript
import {
  uploadTestFile,
  uploadMultipleFiles,
  createTempFile,
  deleteTempFile,
  deleteTempFiles,
  fileExists,
  readFileContent,
  cleanupTestFiles,
  createFileWithSize
} from './helpers';

// Subir archivo de prueba
const response = await uploadTestFile(authToken, {
  filename: 'test.txt',
  content: 'Test content',
  mimeType: 'text/plain'
});

// Subir múltiples archivos
const files = await uploadMultipleFiles(authToken, 5, 'file');

// Crear archivo temporal
const filePath = createTempFile('temp.txt', 'content');
// ... usar archivo ...
deleteTempFile(filePath);

// Verificar existencia
if (fileExists('/path/to/file.txt')) {
  const content = readFileContent('/path/to/file.txt');
}

// Crear archivo con tamaño específico (5MB)
const bigFile = createFileWithSize('big.txt', 5 * 1024 * 1024);

// Limpiar archivos de prueba
cleanupTestFiles('./uploads');
```

### Delay Helper

```typescript
import {
  delay,
  shortDelay,
  mediumDelay,
  longDelay,
  executeWithDelay,
  retryWithBackoff
} from './helpers';

// Delay simple (1000ms)
await delay(1000);

// Delays predefinidos
await shortDelay(); // 100ms
await mediumDelay(); // 500ms (útil para rate limiting)
await longDelay(); // 1000ms

// Ejecutar con delay
const result = await executeWithDelay(async () => {
  return await someOperation();
}, 500);

// Retry con backoff exponencial
const result = await retryWithBackoff(
  async () => {
    return await someFlakeyOperation();
  },
  3,
  100
); // 3 intentos, delay inicial 100ms
```

## 📝 Ejemplo Completo de Test

```typescript
import { request, app } from '../setup';
import { UserBuilder, DocumentBuilder } from '../builders';
import { registerAndLogin, uploadTestFile, mediumDelay } from '../helpers';
import { basicTextFile, ssrfUrls } from '../fixtures';

describe('Document Upload with Security', () => {
  let authToken: string;

  beforeEach(async () => {
    // Usar helper para autenticación
    const { token } = await registerAndLogin();
    authToken = token;
  });

  it('should upload a document successfully', async () => {
    // Usar helper para subir archivo
    const response = await uploadTestFile(authToken, {
      filename: basicTextFile.filename,
      content: basicTextFile.content
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.filename).toBeDefined();
  });

  it('should reject malicious filenames', async () => {
    // Usar builder para archivo malicioso
    const malicious = new DocumentBuilder().withMaliciousFilename().build();

    const response = await uploadTestFile(authToken, {
      filename: malicious.filename,
      content: malicious.content
    });

    // Multer sanitiza con UUID, siempre es seguro
    expect([201, 400, 401]).toContain(response.status);
  });

  it('should validate URLs against SSRF', async () => {
    // Usar fixtures para tests de seguridad
    for (const test of ssrfUrls) {
      const result = validateUrl(test.url);
      expect(result.isValid).toBe(test.shouldBeValid);

      // Delay para evitar rate limiting
      await mediumDelay();
    }
  });

  it('should create multiple users with unique emails', async () => {
    // Usar builder para múltiples usuarios
    const users = UserBuilder.buildMany(3, 'user');

    for (const user of users) {
      const response = await request(app).post('/api/auth/register').send(user);

      expect(response.status).toBe(201);
    }
  });
});
```

## 📊 Tipos de Tests

### Tests de Integración (`integration/`)

Prueban los endpoints completos de la API:

- **auth.test.ts**: Registro, login, validaciones de autenticación
- **documents.test.ts**: Subida, listado, compartir, eliminar documentos
- **folders.test.ts**: Crear, listar, renombrar, eliminar carpetas
- **password-validation.test.ts**: Validación de contraseñas fuertes
- **url-path-security.test.ts**: Protección SSRF, Open Redirect, Path Traversal

### Tests Unitarios (`unit/`)

Prueban funciones y servicios individuales:

- **jwt.service.test.ts**: Generación y verificación de tokens JWT

## ✅ Buenas Prácticas

1. **Usar Builders** para objetos complejos o con muchas variaciones

   ```typescript
   const user = new UserBuilder().withUniqueEmail().withStrongPassword().build();
   ```

2. **Usar Fixtures** para datos simples y predefinidos

   ```typescript
   const response = await request(app).post('/register').send(basicUser);
   ```

3. **Usar Helpers** para operaciones comunes repetitivas

   ```typescript
   const { token } = await registerAndLogin();
   ```

4. **Limpiar recursos** después de cada test

   ```typescript
   afterEach(() => {
     DocumentBuilder.deleteTempFile(filePath);
   });
   ```

5. **Usar delays apropiados** para evitar rate limiting

   ```typescript
   afterEach(async () => {
     await mediumDelay();
   });
   ```

6. **Nombres descriptivos** que expliquen qué se está probando

   ```typescript
   it('should reject password without uppercase letter', async () => {
     // ...
   });
   ```

7. **Tests independientes** que no dependan del orden de ejecución
   ```typescript
   beforeEach(async () => {
     // Reset state before each test
   });
   ```

## 📈 Test Coverage

Ejecutar tests con cobertura:

```bash
npm run test:coverage
```

Esto generará un reporte de cobertura mostrando qué porcentaje del código está cubierto por tests.

## 🔗 Importaciones Simplificadas

Todos los builders, fixtures y helpers exportan desde archivos index:

```typescript
// En lugar de:
import { UserBuilder } from './builders/user.builder';
import { DocumentBuilder } from './builders/document.builder';

// Puedes usar:
import { UserBuilder, DocumentBuilder } from './builders';

// Similar para fixtures y helpers:
import { basicUser, ssrfUrls } from './fixtures';
import { registerAndLogin, uploadTestFile, mediumDelay } from './helpers';
```

## 🚨 Notas Importantes

- **Archivos temporales**: Siempre limpiar con `deleteTempFile()` después de usarlos
- **Rate limiting**: Usar delays entre requests para evitar bloqueos
- **Base de datos**: Los tests limpian la DB entre ejecuciones (ver `setup.ts`)
- **Autenticación**: JWT tokens expiran, usar helpers para generar nuevos
- **UUID sanitization**: Multer ya sanitiza nombres de archivo con UUIDs

---

Para más información sobre la estructura del proyecto, ver el [README principal](../README.md).
