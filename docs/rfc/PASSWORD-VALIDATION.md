# Validación de Contraseñas Fuertes - Implementación

## Descripción

Se ha implementado un sistema robusto de validación de contraseñas que garantiza que todas las contraseñas de usuario cumplan con estándares de seguridad específicos. Esta validación se aplica tanto al registro de nuevos usuarios como al cambio de contraseñas.

## Requisitos de Contraseña

Las contraseñas deben cumplir los siguientes requisitos:

- **Longitud mínima:** 8 caracteres
- **Longitud máxima:** 128 caracteres
- **Letra mayúscula:** Al menos una (A-Z)
- **Letra minúscula:** Al menos una (a-z)
- **Número:** Al menos uno (0-9)
- **Carácter especial:** Al menos uno (!@#$%^&\*()\_+-=[]{};\':"|,.<>?/`~)
- **Sin espacios:** No se permiten espacios en blanco

## Archivos Modificados/Creados

### 1. Nuevo Archivo - Utilidad de Validación

**Archivo:** `src/utils/password-validator.ts`

Contiene la lógica central de validación:

- `PASSWORD_REQUIREMENTS`: Configuración de requisitos
- `validatePassword(password)`: Retorna {isValid, errors[]}
- `validatePasswordOrThrow(password)`: Lanza error si es inválida
- `getPasswordRequirementsMessage()`: Mensaje amigable de requisitos

### 2. Servicios Actualizados

#### `src/services/auth.service.ts`

- Integrada validación en `registerUser()`
- Valida la contraseña antes del hash
- Lanza HttpError con código 400 si falla

#### `src/services/user.service.ts`

- Integrada validación en `changePassword()`
- Valida la nueva contraseña antes del hash
- Incrementa tokenVersion tras cambio exitoso

### 3. Controladores Mejorados

#### `src/controllers/auth.controller.ts`

- Manejo específico de errores de validación de contraseña
- Retorna código 400 con mensaje descriptivo

#### `src/controllers/user.controller.ts`

- Captura errores de validación en cambio de contraseña
- Diferencia entre validación fallida (400) y contraseña actual incorrecta (401)

### 4. Tests Actualizados

#### Nuevos Tests - `tests/integration/password-validation.test.ts`

- 7 tests de validación en registro
- 3 tests de validación en cambio de contraseña
- Cobertura completa de todos los requisitos

#### Tests Existentes Actualizados

- `tests/integration/auth.test.ts`
- `tests/integration/documents.test.ts`
- `tests/integration/folders.test.ts`

Todas las contraseñas de prueba actualizadas para cumplir con requisitos de seguridad.

### 5. Middleware Actualizado

#### `src/middlewares/rate-limit.middleware.ts`

- Agregado `skip` para entorno de test
- Evita bloqueo de tests por límite de intentos

## Flujo de Validación

### Registro de Usuario

```text

POST /api/auth/register
   ↓
auth.controller.register()
   ↓
auth.service.registerUser()
   ↓
validatePasswordOrThrow()  ← VALIDACIÓN
   ↓
bcrypt.hash()
   ↓
user.save()
```

### Cambio de Contraseña

```text
PATCH /api/users/:id/password
   ↓
user.controller.changePassword()
   ↓
user.service.changePassword()
   ↓
validatePasswordOrThrow()  ← VALIDACIÓN
   ↓
bcrypt.compare() (contraseña actual)
   ↓
bcrypt.hash() (nueva contraseña)
   ↓
user.save() + tokenVersion++
```

## Ejemplos de Uso

### Contraseña Válida ✅

```text
StrongP@ss123
MySecure#2024
Test@1234
```

### Contraseñas Inválidas ❌

```text
password123    - Sin mayúscula ni carácter especial
PASSWORD123!   - Sin minúscula
StrongPass!    - Sin número
StrongPass123  - Sin carácter especial
Weak@1         - Menos de 8 caracteres
My Pass@123    - Contiene espacios
```

## Respuestas de API

### Éxito (201/200)

```json
{
  "success": true,
  "user": { ... },
  "token": "..."
}
```

### Error de Validación (400)

```json
{
  "success": false,
  "error": "Password validation failed: Password must contain at least one uppercase letter (A-Z)"
}
```

## Tests

Ejecutar tests de validación de contraseña:

```bash
npm test -- password-validation.test.ts
```

Ejecutar todos los tests:

```bash
npm test
```

### Resultados Esperados

```text
Test Suites: 5 passed, 5 total
Tests:       37 passed, 37 total
```

## Consideraciones de Seguridad

1. **Validación antes del hash:** La validación ocurre antes de hashear la contraseña para evitar procesamiento innecesario
2. **Mensajes descriptivos:** Los errores son claros pero no revelan información sensible del sistema
3. **Consistencia:** Misma validación en registro y cambio de contraseña
4. **Rate limiting:** Protección contra ataques de fuerza bruta (deshabilitado en tests)
5. **Token versioning:** Al cambiar contraseña, se invalidan todos los tokens existentes

## Mantenimiento

Para modificar los requisitos de contraseña, editar:

```typescript
// src/utils/password-validator.ts
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  disallowWhitespace: true
};
```

## Notas de Implementación

- **Idioma de mensajes:** Inglés (según estándares del proyecto)
- **Documentación:** Español (según estándares del proyecto)
- **Compatibilidad:** Compatible con el sistema de autenticación JWT existente
- **Retrocompatibilidad:** No afecta usuarios existentes con contraseñas débiles (solo se valida en registro y cambio)
