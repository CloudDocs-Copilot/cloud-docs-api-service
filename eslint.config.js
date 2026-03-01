// @ts-check
const path = require('path');

const parser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = {
  languageOptions: {
    parser,
    parserOptions: {
      project: ['./tsconfig.eslint.json', './tsconfig.json'],
      tsconfigRootDir: __dirname,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
  },
  rules: {
    // Prohibir el uso de 'any' - REGLAS CRÍTICAS SEGÚN AGENTS.md
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',

    // Buenas prácticas de TypeScript
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // Evitar console.log en producción
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // Variables no usadas
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
  ignores: [
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '*.js',
    '*.config.js',
    'scripts/**',
    'uploads/**',
    'util-default-config-data/**',
  ],
};
