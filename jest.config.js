module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',

  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],

  // Excluir tests de embedding que requieren configuración específica sin mocks globales
  testPathIgnorePatterns: [
    '/node_modules/',
    '.*embedding\\.service\\.test\\.ts$',
    '.*embedding\\.service\\.error-validation\\.test\\.ts$'
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
    '!src/**/index.ts', // Excluir archivos barrel
    '!src/docs/**',
    '!**/node_modules/**'
  ],

  // Directorio de salida para reportes de cobertura
  coverageDirectory: process.env.COVERAGE_DIR || 'coverage',

  // Umbrales de cobertura (opcional)
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 69,
      lines: 70,
      statements: 70
    }
  },

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
  // Mapear alias de import `src/*` a la carpeta real para que jest pueda resolverlos
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1'
  }
};
