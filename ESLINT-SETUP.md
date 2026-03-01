# Configuración de ESLint - Detección de uso de `any`

## Resumen

Se ha configurado ESLint en el proyecto para **detectar y prohibir el uso de `any`** según las pautas establecidas en [AGENTS.md](AGENTS.md).

## Problema Identificado

**CRÍTICO:** El proyecto tenía **971 errores** relacionados con el uso de `any`:

- `@typescript-eslint/no-explicit-any`: Uso explícito de `any` (ej: `error: any`)
- `@typescript-eslint/no-unsafe-assignment`: Asignaciones inseguras de valores `any`
- `@typescript-eslint/no-unsafe-member-access`: Acceso a propiedades de valores `any`
- `@typescript-eslint/no-unsafe-call`: Llamadas a funciones tipadas como `any`
- `@typescript-eslint/no-unsafe-argument`: Argumentos de tipo `any`
- `@typescript-eslint/no-unsafe-return`: Retornos de tipo `any`

Además, hay **380 advertencias adicionales** relacionadas con:

- Uso de `console.log` en lugar de `console.warn/error`
- Falta de tipos de retorno en funciones
- Falta de tipos en parámetros de funciones exportadas

## Configuración Instalada

### Archivos creados

1. **[eslint.config.js](eslint.config.js)** - Configuración de ESLint (formato moderno v10)
2. **[.eslintignore](. eslintignore)** - Archivos a ignorar (deprecated, pero mantenido)

### Dependencias instaladas

```json
{
  "devDependencies": {
    "eslint": "^10.0.2",
    "@eslint/js": "^10.x.x",
    "@typescript-eslint/parser": "^8.x.x",
    "@typescript-eslint/eslint-plugin": "^8.x.x",
    "typescript-eslint": "^8.x.x"
  }
}
```

### Scripts agregados al package.json

```json
{
  "scripts": {
    "lint": "eslint src tests --ext .ts",
    "lint:fix": "eslint src tests --ext .ts --fix",
    "lint:check": "eslint src tests --ext .ts --max-warnings 0"
  }
}
```

## Reglas Configuradas

Todas las reglas están configuradas como **ERROR** (no warnings) para forzar el cumplimiento:

```javascript
rules: {
  // Prohibir el uso de 'any' - REGLAS CRÍTICAS SEGÚN AGENTS.md
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',

  // Buenas prácticas de TypeScript
  '@typescript-eslint/explicit-function-return-type': 'warn',
  '@typescript-eslint/explicit-module-boundary-types': 'warn',
  
  // Evitar console.log en producción
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  
  // Variables no usadas
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
  }],
}
```

## Uso

### Verificar errores

```bash
npm run lint
```

### Intentar corrección automática

```bash
npm run lint:fix
```

**NOTA:** La mayoría de errores de `any` **NO** se pueden arreglar automáticamente. Requieren intervención manual para definir tipos apropiados.

### Verificar que no hay warnings (para CI/CD)

```bash
npm run lint:check
```

## Estado Actual

❌ **El proyecto NO pasa el linting actualmente**

**Estadísticas:**

- **971 errores** relacionados con uso de `any`
- **380+ advertencias** adicionales
- **Total: 1,351 problemas detectados**

## Plan de Remediación

Para cumplir con las pautas de [AGENTS.md](AGENTS.md), se debe:

1. **Corto plazo:** Agregar `npm run lint:check` al pre-commit hook
2. **Mediano plazo:** Refactorizar gradualmente los archivos con más errores:
   - `src/services/*.ts` (la mayoría de errores)
   - `src/controllers/*.ts`
   - `src/middlewares/*.ts`
   - `tests/**/*.ts`

3. **Tipos recomendados en lugar de `any`:**

   ```typescript
   // ❌ INCORRECTO
   catch (error: any) { ... }
   function process(data: any) { ... }
   const filters: any[] = [];

   // ✅ CORRECTO
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

   type Filter = { field: string; value: string };
   const filters: Filter[] = [];
   ```

## Integración con CI/CD

Para evitar que se agreguen nuevos usos de `any`, agregar al pipeline:

```yaml
# .github/workflows/ci.yml
- name: Run Linter
  run: npm run lint:check
```

Esto bloqueará cualquier PR que introduzca nuevos errores de linting.

## Referencias

- [AGENTS.md](AGENTS.md) - Pautas del proyecto que prohíben `any`
- [ESLint TypeScript Rules](https://typescript-eslint.io/rules/)
- [TypeScript unknown vs any](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type)
