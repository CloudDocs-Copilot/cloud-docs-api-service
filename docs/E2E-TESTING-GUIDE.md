# Guía de Tests E2E (End-to-End)

## 📋 Tipos de Tests

El proyecto tiene 3 niveles de testing:

| Tipo | Ubicación | Comando | Servidor Necesario |
|------|-----------|---------|-------------------|
| **Unit Tests** | `tests/unit/` | `npm run test:unit` | ❌ No |
| **Integration Tests** | `tests/integration/` | `npm run test:integration` | ❌ No |
| **E2E Tests** | `tests/e2e/` | `npm run test:e2e` | ✅ Sí |

## 🎯 Tests E2E: Cómo Ejecutarlos

Los tests E2E prueban el flujo completo (Frontend → Backend → MongoDB → Elasticsearch) sin mocks.

### Prerequisitos

Antes de correr tests E2E, asegurar que estén corriendo:

1. **MongoDB** en `localhost:27017`
   ```bash
   # Verificar
   mongo --eval "db.runCommand({ connectionStatus: 1 })"
   ```

2. **Elasticsearch** en `localhost:9200`
   ```bash
   # Verificar
   curl http://localhost:9200/_cluster/health
   ```

3. **Backend Server** en `localhost:4000`
   ```bash
   # Terminal 1: Levantar servidor en modo desarrollo
   npm run dev
   ```

### Ejecutar Tests E2E

Una vez el servidor esté corriendo en otra terminal:

```bash
# Terminal 2: Correr tests E2E
npm run test:e2e
```

**Características:**
- Usa `NODE_ENV=development` (NO test, para que use BD real)
- `--runInBand` ejecuta tests secuencialmente (no paralelamente)
- Hace peticiones HTTP reales al servidor en puerto 4000
- Usa datos de fixtures (`tests/fixtures/`)

### Flujo Completo para Pre-Commit

```bash
# 1. Correr tests unitarios e integración (sin servidor)
npm test

# 2. Si pasan, levantar servidor en Terminal 1
npm run dev

# 3. En Terminal 2: Correr tests E2E
npm run test:e2e

# 4. Si todos pasan → hacer commit
git add .
git commit -m "feat: ..."
```

## 📊 Comandos de Testing Disponibles

```bash
# Tests sin servidor (pre-commit obligatorio)
npm test                    # Unit + Integration (sin E2E)
npm run test:unit           # Solo unit tests
npm run test:integration    # Solo integration tests

# Tests con servidor corriendo
npm run test:e2e            # Solo E2E tests (servidor debe estar corriendo)
npm run test:all            # TODOS los tests (incluye E2E - servidor necesario)

# Utilidades
npm run test:watch          # Watch mode (sin E2E)
npm run test:coverage       # Reporte de cobertura (sin E2E)
```

## ⚠️ Tests E2E Actuales

Los siguientes tests E2E están implementados:

### `tests/e2e/search.e2e.test.ts` (US-104)
- ✅ Búsqueda por nombre de archivo (parcial, case-insensitive)
- ✅ Filtros por tipo MIME
- ✅ Filtros por rango de fechas
- ✅ Ordenamiento por relevancia (score)
- ✅ Autocompletado
- ✅ Validaciones (401 sin auth, 400 sin query)
- ✅ Seguridad (solo documentos de la organización)
- ✅ Rendimiento (<1 segundo)

**Prerequisitos adicionales:**
- Usuario de fixture debe existir en MongoDB
- Documentos de prueba indexados en Elasticsearch

## 🐛 Troubleshooting

### Error: `AggregateError` al hacer login

**Causa:** Servidor no está corriendo en puerto 4000

**Solución:**
```bash
# Terminal 1
npm run dev

# Esperar a ver "Backend server listening on port 4000"
# Luego en Terminal 2
npm run test:e2e
```

### Error: `MongooseError: buffering timed out`

**Causa:** MongoDB no está corriendo o no es accesible

**Solución:**
```bash
# Windows
net start MongoDB

# Verificar conexión
mongosh --eval "db.runCommand({ ping: 1 })"
```

### Error: `connect ECONNREFUSED localhost:9200`

**Causa:** Elasticsearch no está corriendo

**Solución:**
```bash
# Windows (si instalado como servicio)
net start Elasticsearch

# Verificar
curl http://localhost:9200
```

### Tests E2E fallan pero servidor funciona manualmente

**Posibles causas:**
1. **Fixtures no existen:** Correr `npm run seed:dev` para crear datos de prueba
2. **Puerto incorrecto:** Verificar que `API_BASE_URL` en tests coincida con servidor
3. **Credenciales:** Verificar `tests/fixtures/user.fixtures.ts` tiene usuario correcto

## 🔄 Integración Continua (CI/CD)

Para correr tests E2E en CI/CD (GitHub Actions, GitLab CI, etc.):

```yaml
# .github/workflows/test.yml (ejemplo)
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
      
      elasticsearch:
        image: docker.elastic.co/elasticsearch/elasticsearch:8.10.0
        ports:
          - 9200:9200
        env:
          discovery.type: single-node
          xpack.security.enabled: false
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit & integration tests
        run: npm test
      
      - name: Seed test data
        run: npm run seed:dev
      
      - name: Start server in background
        run: npm run dev &
        env:
          NODE_ENV: development
      
      - name: Wait for server
        run: npx wait-on http://localhost:4000/api/health
      
      - name: Run E2E tests
        run: npm run test:e2e
```

## 📝 Buenas Prácticas

### ✅ DO
- Correr `npm test` (sin E2E) antes de cada commit
- Levantar servidor manualmente para tests E2E locales
- Usar fixtures para datos de prueba consistentes
- Limpiar datos de prueba después de E2E (en `afterAll`)

### ❌ DON'T
- No correr `npm run test:all` en pre-commit (requiere servidor)
- No modificar fixtures sin actualizar tests dependientes
- No usar datos hardcodeados en tests E2E (usar fixtures)
- No hacer commits si tests E2E fallan

## 🎓 Referencias

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest for API Testing](https://github.com/ladjs/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
