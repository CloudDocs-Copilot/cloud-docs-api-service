module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',

  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],

  // Excluir tests de embedding que requieren configuración específica sin mocks globales
  // y tests de Ollama que requieren Ollama server corriendo localmente
  // y tests/unit/** que se ejecutan por separado con jest.unit.config.js
  // y tests/e2e/** que requieren servicios externos (Elasticsearch, MongoDB, servidor live)
  testPathIgnorePatterns: [
    '/node_modules/',
    '.*embedding\\.service\\.test\\.ts$',
    '.*embedding\\.service\\.error-validation\\.test\\.ts$',
    '.*ollama\\.provider\\.test\\.ts$', // Ollama integration tests (use RUN_OLLAMA_TESTS=true to enable)
    'tests/unit/', // Unit tests ejecutados por separado con jest.unit.config.js
    'tests/e2e/' // E2E tests require live external services (run manually with npm run test:e2e)
  ],

  // Transformación de archivos TypeScript
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Módulos de TypeScript
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Cobertura de código
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts', // Excluir el punto de entrada principal
    '!src/app.ts',
    '!src/**/index.ts', // Excluir archivos barrel
    '!src/configurations/**', // Excluir archivos de configuración (no cuentan para coverage)
    '!src/configurations/**/**',
    '!src/docs/**',
    '!scripts/**',
    '!uploads/**',
    '!storage/**',
    '!**/node_modules/**'
  ],

  // Directorio de salida para reportes de cobertura
  coverageDirectory: process.env.COVERAGE_DIR || 'coverage',

  // Umbrales de cobertura verificados DESPUÉS del merge en test:ci
  // No se verifican en ejecuciones individuales para evitar falsos negativos
  // coverageThreshold: {
  //   global: {
  //     branches: 60,
  //     functions: 69,
  //     lines: 70,
  //     statements: 70
  //   }
  // },

  // Timeout para tests (útil para tests de integración con DB)
  testTimeout: 30000,

  // Archivo de setup para tests (mocks globales)
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  // Configuración de verbose para ver detalles de los tests
  verbose: true,

  // Limpiar mocks automáticamente entre tests
  clearMocks: true,

  // Restablecer mocks entre tests
  resetMocks: true,

  // Restaurar mocks entre tests
  restoreMocks: true,
  // Patrones de archivos que se IGNORAN por completo al calcular coverage
  coveragePathIgnorePatterns: [
    '<rootDir>/src/configurations/',
    '<rootDir>/src/app.ts',
    '<rootDir>/src/index.ts',
    '<rootDir>/scripts/',
    '<rootDir>/docs/',
    '<rootDir>/uploads/',
    '<rootDir>/storage/'
  ],
  // Mapear alias de import `src/*` a la carpeta real para que jest pueda resolverlos
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1'
  }
};
