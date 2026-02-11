module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',

  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],

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
    '!src/docs/**',
    '!**/node_modules/**'
  ],

  // Directorio de salida para reportes de cobertura
  coverageDirectory: 'coverage',

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
  restoreMocks: true
};
