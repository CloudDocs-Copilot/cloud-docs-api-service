/**
 * Jest configuration for UNIT TESTS only
 *
 * This configuration:
 * - Runs only tests in tests/unit/** directory
 * - Uses jest.unit.setup.ts which DOES NOT include global embedding mocks
 * - Allows unit tests to have full control over their own mocks
 * - Excludes integration tests that depend on global mocks
 */

module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',

  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test - SOLO UNIT TESTS
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.spec.ts'],

  // Excluir tests que requieren setup específico con mocks globales
  testPathIgnorePatterns: [
    '/node_modules/',
    'tests/unit/configs/openai-config.test.ts' // Requiere comportamiento específico de jest.resetModules()
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
    '!src/index.ts',
    '!src/**/index.ts',
    '!src/docs/**',
    '!**/node_modules/**'
  ],

  // Directorio de salida para reportes de cobertura
  coverageDirectory: process.env.COVERAGE_DIR || 'coverage/unit',

  // No verificar umbrales aquí - se verifican después del merge

  // Timeout para tests
  testTimeout: 10000,

  // IMPORTANTE: Usa setup específico para unit tests SIN mocks globales de embedding
  setupFilesAfterEnv: ['<rootDir>/tests/jest.unit.setup.ts'],

  // Configuración de verbose para ver detalles de los tests
  verbose: true,

  // Limpiar mocks automáticamente entre tests
  clearMocks: true,

  // Restablecer mocks entre tests
  resetMocks: true,

  // Restaurar mocks entre tests
  restoreMocks: true,

  // Mapear alias de import `src/*` a la carpeta real
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1'
  },
  // Evitar que ts-jest ejecute diagnósticos de TypeScript en node_modules
  // Esto previene errores de tipos de dependencias (ej. openai) durante los tests unitarios
  globals: {
    'ts-jest': {
      diagnostics: false,
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }
  }
};
