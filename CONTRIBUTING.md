# Contribuir a CloudDocs API Service

¡Gracias por tu interés en contribuir a CloudDocs! Este documento proporciona lineamientos e instrucciones para contribuir.

## Tabla de contenido

- [Código de conducta](#código-de-conducta)
- [Primeros pasos](#primeros-pasos)
- [Configuración de desarrollo](#configuración-de-desarrollo)
- [Estilo de código](#estilo-de-código)
- [Lineamientos de commits](#lineamientos-de-commits)
- [Proceso de pull request](#proceso-de-pull-request)
- [Testing](#testing)

## Código de conducta

Por favor, sé respetuoso y constructivo en todas las interacciones. Damos la bienvenida a contribuidores de todos los orígenes y niveles de experiencia.

## Primeros pasos

### Prerrequisitos

- Node.js 20+
- npm 9+
- Docker y Docker Compose (recomendado)
- Git

### Configuración de desarrollo

#### Opción 1: Docker (Recomendado)

La forma más sencilla de comenzar es usando Docker Compose desde la raíz del proyecto:

```bash
# Desde la raíz del workspace (padre de cloud-docs-api-service)
cp .env.example .env.local
docker-compose up -d

# Backend disponible en http://localhost:4000
# Documentación de la API en http://localhost:4000/api/docs
```

#### Opción 2: Desarrollo local

1. **Clona e instala dependencias:**

   ```bash
   cd cloud-docs-api-service
   npm install
   ```

2. **Configura el entorno:**

   ```bash
   cp .env.example .env.local
   # Edita .env.local con tu configuración local
   ```

3. **Inicia MongoDB (Docker):**

   ```bash
   docker run -d --name mongodb -p 27017:27017 mongo:6.0
   ```

4. **Inicia el servidor de desarrollo:**

   ```bash
   npm run dev
   ```

5. **Verifica que esté corriendo:**
   ```bash
   curl http://localhost:4000/api
   # Debe devolver: {"message":"API running"}
   ```

### Estructura del proyecto

```text
src/
├── index.ts          # Punto de entrada
├── app.ts            # Configuración de Express
├── routes/           # Endpoints de la API
├── controllers/      # Manejadores de solicitudes
├── services/         # Lógica de negocio
├── models/           # Esquemas de base de datos
├── middlewares/      # Auth, validación, etc.
└── utils/            # Funciones auxiliares
```

Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para documentación detallada.

## Estilo de código

### Lineamientos de TypeScript

- **Modo estricto habilitado** - Todo el código debe pasar validación estricta de tipos
- **Sin `any`** - Usa `unknown` cuando el tipo sea realmente desconocido
- **Tipos de retorno explícitos** - Siempre tipa los retornos de funciones
- **Interface sobre type** - Prefiere `interface` para estructuras de objetos

### Convenciones de nombres

| Tipo       | Convención               | Ejemplo           |
| ---------- | ------------------------ | ----------------- |
| Archivos   | kebab-case               | `user.service.ts` |
| Clases     | PascalCase               | `UserService`     |
| Interfaces | PascalCase + prefijo `I` | `IUser`           |
| Funciones  | camelCase                | `getUserById`     |
| Constantes | SCREAMING_SNAKE_CASE     | `MAX_FILE_SIZE`   |
| Variables  | camelCase                | `userData`        |

### Organización de archivos

```typescript
// 1. Imports (externos primero, luego internos)
import express from 'express';
import mongoose from 'mongoose';

import { UserService } from '../services/user.service';
import type { IUser } from '../models/types/user.types';

// 2. Constantes
const MAX_RETRIES = 3;

// 3. Types/Interfaces (si son locales al archivo)
interface RequestParams {
  id: string;
}

// 4. Código principal
export class UserController {
  // ...
}
```

### Manejo de errores

Usa siempre la clase `HttpError` para errores de API:

```typescript
import HttpError from '../models/error.model';

// En controllers/services
if (!user) {
  throw new HttpError(404, 'User not found');
}
```

## Lineamientos de commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Tipos

- `feat`: Nueva funcionalidad
- `fix`: Corrección de error
- `docs`: Solo documentación
- `style`: Formato, puntos y comas faltantes, etc.
- `refactor`: Cambio de código que no corrige un error ni agrega una funcionalidad
- `test`: Agregar o corregir tests
- `chore`: Tareas de mantenimiento

### Ejemplos

```bash
feat(auth): add password reset functionality
fix(documents): handle empty file upload error
docs(readme): update installation instructions
test(users): add unit tests for user service
```

## Proceso de pull request

1. **Crea una rama:**

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Haz tus cambios** siguiendo los lineamientos de estilo de código

3. **Escribe tests** para la nueva funcionalidad

4. **Ejecuta validaciones localmente:**

   ```bash
   npm run format      # Formatear código
   npm test            # Ejecutar tests
   npm run build       # Verificar que TypeScript compile
   ```

5. **Haz push y crea el PR:**

   ```bash
   git push origin feat/your-feature-name
   ```

6. **Completa la plantilla del PR** con:
   - Descripción de cambios
   - Issue relacionado (si existe)
   - Capturas de pantalla (para cambios de UI)
   - Confirmación del checklist

### Requisitos del PR

- [ ] Los tests pasan (`npm test`)
- [ ] El código compila (`npm run build`)
- [ ] El código está formateado (`npm run format`)
- [ ] Las nuevas funcionalidades tienen tests
- [ ] La documentación está actualizada si es necesario

## Testing

### Ejecutar tests

```bash
# Todos los tests
npm test

# Modo watch (re-ejecuta al haber cambios)
npm run test:watch

# Con reporte de cobertura
npm run test:coverage
```

### Escribir tests

Usamos Jest con la siguiente estructura:

```typescript
// tests/unit/services/user.service.test.ts
import { UserService } from '../../../src/services/user.service';
import { UserBuilder } from '../../builders/user.builder';

describe('UserService', () => {
  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const user = new UserBuilder().build();

      // Act
      const result = await UserService.getUserById(user._id);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(user.email);
    });

    it('should throw error when user not found', async () => {
      // Act & Assert
      await expect(UserService.getUserById('invalid-id')).rejects.toThrow('User not found');
    });
  });
});
```

### Test Builders

Usa builders de `tests/builders/` para datos de prueba:

```typescript
import { UserBuilder, OrganizationBuilder } from '../builders';

const user = new UserBuilder().withEmail('test@example.com').withRole('admin').build();

const org = new OrganizationBuilder().withPlan('PREMIUM').build();
```

## ¿Preguntas?

- Revisa la [documentación](docs/) existente
- Abre un issue para errores o solicitudes de funcionalidad
- Contacta a los maintainers

¡Gracias por contribuir! 🎉
