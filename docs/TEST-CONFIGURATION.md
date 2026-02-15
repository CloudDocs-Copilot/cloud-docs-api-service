# Configuración de Tests Separados

Este proyecto utiliza dos configuraciones de Jest diferentes para optimizar la ejecución de tests:

## Configuraciones

### 1. Configuración Estándar (`jest.config.js`)

- **Uso:** `npm test`
- **Propósito:** Tests de integración y la mayoría de unit tests
- **Setup:** `tests/jest.setup.ts` (incluye mocks globales de embedding)
- **Tests excluidos:**
  - `embedding.service.test.ts`
  - `embedding.service.error-validation.test.ts`
- **Alcance:** Integration tests + most unit tests

### 2. Configuración Unit Tests (`jest.unit.config.js`)

- **Uso:** `npm run test:unit`
- **Propósito:** Unit tests puros que necesitan control total sobre mocks
- **Setup:** `tests/jest.unit.setup.ts` (SIN mocks globales de embedding)
- **Tests incluidos:** Solo `tests/unit/**`
- **Tests excluidos:** `openai-config.test.ts` (requiere jest.resetModules específico)
- **Alcance:** Unit tests with isolated mocks

## Comandos Disponibles

```bash
# ⭐ CI/CD: Ejecutar TODOS los tests + coverage combinado (RECOMENDADO)
npm run test:ci
# → Ejecuta TODOS los test suites (main + unit)
# → Genera coverage combinado (main + unit) en coverage/

# Ejecutar todos los tests (integración + unit sin embedding)
npm test

# Ejecutar solo unit tests (incluye embedding tests)
npm run test:unit

# Ejecutar solo integration tests
npm run test:integration

# Ejecutar con coverage (configuración estándar)
npm run test:coverage

# Ejecutar con coverage (solo unit tests)
npm run test:coverage:unit

# Watch mode
npm run test:watch
```

## 🚀 Para CI/CD

### Comando Principal de CI

```bash
npm run test:ci
```

Este comando ejecuta automáticamente:

1. ✅ **Todos los tests main** (integration + most unit) con coverage → `coverage/main/`
2. ✅ **Todos los tests unit** (isolated unit tests) con coverage → `coverage/unit/`
3. ✅ **Merge de coverage** en un reporte unificado → `coverage/`

#### Resultado: Coverage combinado de ambas configuraciones en un solo reporte

### Coverage Combinado Generado

```text
coverage/
├── coverage-final.json    # Coverage JSON combinado
├── lcov.info             # Para Codecov, Coveralls, SonarQube
├── lcov-report/          # Reporte HTML interactivo
│   └── index.html       # Abrir en navegador para ver coverage
└── clover.xml           # Para Jenkins, Bamboo
```

### Métricas de Coverage (Ejemplo)

Ejecutar `npm run test:ci` para ver métricas actuales:

- **Statements:** >75%
- **Branches:** >60%
- **Functions:** >75%
- **Lines:** >75%

> 💡 **Tip:** El coverage combinado incluye tanto integration como unit tests

### Ejemplo de Configuración GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run all tests with coverage
        run: npm run test:ci

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Archive coverage report
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/lcov-report/
```

### Ejemplo de Configuración GitLab CI

```yaml
test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm run test:ci
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
    paths:
      - coverage/
    expire_in: 30 days
```

## Resumen de Tests por Categoría

| Categoría               | Comando                    | Alcance                                  | Uso                  |
| ----------------------- | -------------------------- | ---------------------------------------- | -------------------- |
| **🚀 CI (Todos)**       | `npm run test:ci`          | **Todos los tests + coverage combinado** | **Producción/CI**    |
| Integration + Most Unit | `npm test`                 | Integration + most unit tests            | Desarrollo rápido    |
| Unit Tests Only         | `npm run test:unit`        | Isolated unit tests                      | Tests unitarios      |
| Integration Only        | `npm run test:integration` | Integration tests only                   | Tests de integración |

> 💡 **Tip:** Ejecuta `npm run test:ci` localmente para ver conteos actuales y coverage

## ¿Por qué dos configuraciones?

### Problema Original

Los tests de `embedding.service` fallaban porque:

1. Los integration tests requieren mocks globales de `embeddingService` para evitar llamadas a OpenAI
2. Los unit tests de `embeddingService` necesitan controlar sus propios mocks para testear:
   - Manejo de errores API
   - Validación de dimensiones
   - Casos edge

### Solución

- **jest.setup.ts**: Incluye mocks globales de embedding (líneas 62-71)

  ```typescript
  embeddingService.generateEmbedding = jest.fn(async () => makeVector());
  ```

  → Previene llamadas reales a OpenAI en integration tests

- **jest.unit.setup.ts**: NO incluye mocks globales de embedding
  → Permite a los unit tests controlar sus propios mocks

## Tests de Embedding

Los tests de embedding service están divididos en dos archivos:

### `embedding.service.test.ts`

- Generación de embeddings básica
- Manejo de textos largos
- Caracteres especiales
- Batch processing

### `embedding.service.error-validation.test.ts`

- Validación de dimensiones incorrectas
- Mensajes de error específicos

**Estos tests solo se ejecutan con `npm run test:unit`**

## Tests de Configuración

### `openai-config.test.ts`

- Usa `jest.resetModules()` y `jest.isolateModules()`
- Requiere comportamiento específico de mocks
- Solo se ejecuta con la configuración estándar (`npm test`)
- **No compatible con configuración unit tests**

## Monitoreo de Coverage

```bash
# Coverage completo (excluye embedding)
npm run test:coverage
# → coverage/

# Coverage solo unit tests (incluye embedding)
npm run test:coverage:unit
# → coverage/unit/
```

## Mantenimiento

### Al agregar nuevos tests de embedding

1. Agregar a una de los archivos existentes en `tests/unit/services/embedding.service*.test.ts`
2. Los tests se ejecutarán automáticamente con `npm run test:unit`

### Al agregar tests que usan mocks globales

1. Agregar en cualquier ubicación bajo `tests/`
2. Se ejecutarán con `npm test`

### Al agregar tests de configuración compleja

1. Si usa `jest.resetModules()` → agregar a `jest.unit.config.js` testPathIgnorePatterns
2. Si necesita mocks específicos → documentar en comentarios del archivo

## Estado Actual

✅ **Todos los tests pasan:**

- `npm run test:ci`: Ejecuta TODOS los test suites con coverage combinado 🎉
- `npm test`: Main test suite (integration + most unit)
- `npm run test:unit`: Unit tests con mocks aislados
- `npm run test:integration`: Solo integration tests

✅ **Tests de embedding funcionando:**

- Todos los tests pasan con `npm run test:unit`
- Coverage significativamente mejorado gracias al merge de configuraciones
- Correctamente excluidos de `npm test`

✅ **Sin conflictos de mocks:**

- Integration tests usan mocks globales
- Unit tests de embedding usan mocks locales
- Ambas configuraciones coexisten sin interferencia

✅ **Coverage combinado:**

- Reportes mergeados automáticamente en CI
- Todos los archivos incluidos en el reporte final
- Formatos: JSON, LCOV, HTML, Clover
